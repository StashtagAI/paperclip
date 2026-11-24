// Run: node --experimental-strip-types supabase/functions/admin-web-traffic/test.ts
import assert from "node:assert/strict";
import { handle, HOSTS, shape } from "./handler.ts";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const vars: Record<string, string> = { CLOUDFLARE_ANALYTICS_TOKEN: "cf_token", CLOUDFLARE_ACCOUNT_ID: "acct" };
const post = (token = "admin") => new Request("https://x/admin-web-traffic", { method: "POST", headers: { authorization: `Bearer ${token}` } });
const isAdmin = async (t: string) => {
  if (t === "boom") throw new Error("db down");
  return t === "admin";
};
type Seen = { url: string; auth: string; body: { query: string; variables: Record<string, unknown> } }[];
const cf = (body: unknown, status = 200, seen: Seen = []) =>
  (async (url: string, init: RequestInit) => {
    seen.push({ url, auth: (init.headers as Record<string, string>).authorization, body: JSON.parse(init.body as string) });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
const deps = (fetchFn: typeof fetch, env = vars) => ({ env: (k: string) => env[k], isAdmin, fetchFn, now: () => NOW });

// shape: empty account → zeros, not missing
assert.deepEqual(shape({ d1: [], d7: [], d30: [], pages: [], referrers: [], countries: [] }, NOW), {
  configured: true,
  generated_at: "2026-11-24T12:00:00.000Z",
  visits: { d1: 0, d7: 0, d30: 0 },
  page_views: { d1: 0, d7: 0, d30: 0 },
  top_pages_30d: [],
  top_referrers_30d: [],
  top_countries_30d: [],
});

// shape: totals, own-site referrers dropped, empty referrer is direct
const full = shape(
  {
    d1: [{ count: 4, sum: { visits: 3 } }],
    d7: [{ count: 20, sum: { visits: 12 } }],
    d30: [{ count: 50, sum: { visits: 30 } }],
    pages: [{ count: 40, dimensions: { requestPath: "/" } }, { count: 10, dimensions: { requestPath: "/privacy/" } }],
    referrers: [
      { sum: { visits: 9 }, dimensions: { refererHost: "" } },
      { sum: { visits: 8 }, dimensions: { refererHost: "Stashtag.ai" } },
      { sum: { visits: 7 }, dimensions: { refererHost: "l.instagram.com" } },
    ],
    countries: [{ sum: { visits: 25 }, dimensions: { countryName: "United States" } }, { sum: { visits: 5 }, dimensions: { countryName: null } }],
  },
  NOW,
);
assert.deepEqual(full.configured && full.visits, { d1: 3, d7: 12, d30: 30 });
assert.deepEqual(full.configured && full.page_views, { d1: 4, d7: 20, d30: 50 });
assert.deepEqual(full.configured && full.top_pages_30d, [{ path: "/", views: 40 }, { path: "/privacy/", views: 10 }]);
assert.deepEqual(full.configured && full.top_referrers_30d, [{ host: "direct", visits: 9 }, { host: "l.instagram.com", visits: 7 }]);
assert.deepEqual(full.configured && full.top_countries_30d, [{ country: "United States", visits: 25 }, { country: "Unknown", visits: 5 }]);

// ---------- handler ----------
const ok = { data: { viewer: { accounts: [{ d1: [], d7: [], d30: [{ count: 2, sum: { visits: 1 } }], pages: [], referrers: [], countries: [] }] } }, errors: null };

// Not an admin, no token, or the admin check failing: 403, and Cloudflare is never called
for (const t of ["someone", "", "boom"]) {
  const seen: Seen = [];
  const r = await handle(post(t), deps(cf(ok, 200, seen)));
  assert.equal(r.status, 403, `token ${JSON.stringify(t)}`);
  assert.equal(seen.length, 0);
}
assert.equal((await handle(new Request("https://x", { method: "GET" }), deps(cf(ok)))).status, 405);
assert.equal((await handle(new Request("https://x", { method: "OPTIONS" }), deps(cf(ok)))).status, 200);

// Secrets missing: not configured, not an error
for (const env of [{}, { CLOUDFLARE_ANALYTICS_TOKEN: "t" }, { CLOUDFLARE_ACCOUNT_ID: "a" }]) {
  const r = await handle(post(), deps(cf(ok), env as Record<string, string>));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { configured: false });
}

// Admin with secrets: one GraphQL call with the token, production hosts, bots off, and 1/7/30-day windows ending now
{
  const seen: Seen = [];
  const r = await handle(post(), deps(cf(ok, 200, seen)));
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.configured, true);
  assert.deepEqual(b.visits, { d1: 0, d7: 0, d30: 1 });
  assert.deepEqual(b.page_views, { d1: 0, d7: 0, d30: 2 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://api.cloudflare.com/client/v4/graphql");
  assert.equal(seen[0].auth, "Bearer cf_token");
  const v = seen[0].body.variables as Record<string, { requestHost_in: string[]; bot: number; datetime_geq: string; datetime_lt: string }> & { account: string };
  assert.equal(v.account, "acct");
  assert.deepEqual(v.d1.requestHost_in, HOSTS);
  assert.equal(v.d30.bot, 0);
  assert.equal(v.d1.datetime_geq, "2026-11-23T12:00:00.000Z");
  assert.equal(v.d7.datetime_geq, "2026-11-17T12:00:00.000Z");
  assert.equal(v.d30.datetime_geq, "2026-10-25T12:00:00.000Z");
  assert.equal(v.d30.datetime_lt, "2026-11-24T12:00:00.000Z");
}

// Cloudflare refusing (bad token / permission), GraphQL errors, or the network failing: 502 with a message, no numbers
for (const f of [
  cf({ success: false, errors: [{ message: "Authentication error" }] }, 403),
  cf({ data: null, errors: [{ message: "does not have access to the path" }] }),
  cf({ data: { viewer: { accounts: [] } }, errors: null }),
  (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch,
]) {
  const orig = console.error;
  console.error = () => {};
  const r = await handle(post(), deps(f));
  console.error = orig;
  assert.equal(r.status, 502);
  const b = await r.json();
  assert.equal(typeof b.error, "string");
  assert.equal(b.visits, undefined);
}

console.log("admin-web-traffic: ok");
