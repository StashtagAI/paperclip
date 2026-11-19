// Run: node --experimental-strip-types supabase/functions/waitlist/test.ts
import assert from "node:assert/strict";
import { clientIp, handle, hashIp, MAX_BODY, normalizeEmail } from "./handler.ts";

// normalizeEmail: lowercases and trims, rejects anything the browser's type="email" check (plus a dotted domain) would
assert.equal(normalizeEmail("  Ana.Lee+trips@Example.COM "), "ana.lee+trips@example.com");
for (const bad of ["", "ana", "ana@", "@example.com", "ana@example", "ana lee@example.com", "ana@exa mple.com",
  "ana@-example.com", "<script>@x.com", `${"a".repeat(65)}@example.com`, `a@${"b".repeat(250)}.com`, 42, null]) {
  assert.equal(normalizeEmail(bad), null, `rejects ${String(bad).slice(0, 30)}`);
}

assert.equal(clientIp(new Request("https://x/", { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } })), "203.0.113.5");
assert.equal(clientIp(new Request("https://x/", { headers: { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "1.1.1.1" } })), "198.51.100.7");
assert.equal(clientIp(new Request("https://x/")), "unknown");
const h1 = await hashIp("203.0.113.5", "k1");
assert.match(h1, /^[0-9a-f]{64}$/);
assert.notEqual(h1, await hashIp("203.0.113.5", "k2"), "keyed");
assert.ok(!h1.includes("203"), "no raw IP");

type Call = { fn: string; args: Record<string, unknown> };
const fakeDb = (result: { data?: unknown; error?: unknown } = { data: "ok" }, calls: Call[] = []) => ({
  calls,
  rpc: (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  },
});
const env = (vars: Record<string, string> = {}) => (k: string) => ({ SUPABASE_SERVICE_ROLE_KEY: "service", ...vars })[k];
const SITE = "https://stashtag.ai";
const form = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request("https://fn.example/functions/v1/waitlist", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: SITE, "x-forwarded-for": "203.0.113.5", ...headers },
    body: new URLSearchParams(fields).toString(),
  });
const asJson = { accept: "application/json" };

// No-JS form: 303 to the thank-you page, with the email lowercased and only known fields passed on
{
  const db = fakeDb();
  const res = await handle(form({ email: " Ana@Example.com ", platform: "ios", source: "hero", website: "", extra: "x" }), { db, env: env() });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "https://stashtag.ai/waitlist/thanks/");
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].fn, "waitlist_signup");
  const { p_ip_hash, ...rest } = db.calls[0].args;
  assert.deepEqual(rest, { p_email: "ana@example.com", p_platform: "ios", p_source: "hero", p_utm: {} });
  assert.equal(p_ip_hash, await hashIp("203.0.113.5", "service"), "hashes the IP with the service key when no salt is set");
}

// WAITLIST_IP_SALT is preferred, and WAITLIST_SITE_URL moves the redirect and allowed origin
{
  const db = fakeDb();
  const res = await handle(form({ email: "a@b.co" }, { origin: "http://localhost:8787" }), {
    db,
    env: env({ WAITLIST_IP_SALT: "salt", WAITLIST_SITE_URL: "http://localhost:8787/" }),
  });
  assert.equal(res.headers.get("location"), "http://localhost:8787/waitlist/thanks/");
  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:8787");
  assert.equal(db.calls[0].args.p_ip_hash, await hashIp("203.0.113.5", "salt"));
}

// JS path: JSON reply; unknown platform/source become null; utm_* kept and trimmed
{
  const db = fakeDb();
  const res = await handle(form({
    email: "a@b.co", platform: "windows", source: "elsewhere", utm_source: " ig ", utm_campaign: "x".repeat(150), utm_evil: "no",
  }, asJson), { db, env: env() });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get("access-control-allow-origin"), SITE);
  assert.equal(db.calls[0].args.p_platform, null);
  assert.equal(db.calls[0].args.p_source, null);
  assert.deepEqual(db.calls[0].args.p_utm, { utm_source: "ig", utm_campaign: "x".repeat(100) });
}

// JSON bodies work too
{
  const db = fakeDb();
  const res = await handle(new Request("https://fn.example/", {
    method: "POST", headers: { "content-type": "application/json", ...asJson }, body: JSON.stringify({ email: "A@B.co", platform: "android" }),
  }), { db, env: env() });
  assert.equal(res.status, 200);
  assert.equal(db.calls[0].args.p_email, "a@b.co");
  assert.equal(db.calls[0].args.p_platform, "android");
  const bad = await handle(new Request("https://fn.example/", {
    method: "POST", headers: { "content-type": "application/json", ...asJson }, body: "{not json",
  }), { db, env: env() });
  assert.equal(bad.status, 400);
}

// Duplicate: the RPC says ok either way, and so does the function
{
  const db = fakeDb({ data: "ok" });
  const first = await handle(form({ email: "a@b.co" }, asJson), { db, env: env() });
  const second = await handle(form({ email: "A@B.CO" }, asJson), { db, env: env() });
  assert.deepEqual([first.status, second.status], [200, 200]);
  assert.deepEqual(await second.json(), await first.json());
}

// Bad email: nothing stored; 400 for JS, try-again page without
{
  const db = fakeDb();
  const js = await handle(form({ email: "not-an-email" }, asJson), { db, env: env() });
  assert.equal(js.status, 400);
  assert.deepEqual(await js.json(), { error: "invalid_email" });
  const plain = await handle(form({ email: "not-an-email" }), { db, env: env() });
  assert.equal(plain.status, 303);
  assert.equal(plain.headers.get("location"), "https://stashtag.ai/waitlist/try-again/");
  assert.equal(db.calls.length, 0);
}

// Honeypot: looks like success, nothing stored
{
  const db = fakeDb();
  const js = await handle(form({ email: "bot@spam.com", website: "http://spam" }, asJson), { db, env: env() });
  assert.equal(js.status, 200);
  assert.deepEqual(await js.json(), { ok: true });
  const plain = await handle(form({ email: "bot@spam.com", website: "x" }), { db, env: env() });
  assert.equal(plain.headers.get("location"), "https://stashtag.ai/waitlist/thanks/");
  assert.equal(db.calls.length, 0);
}

// Rate limited and database errors
{
  const limited = await handle(form({ email: "a@b.co" }, asJson), { db: fakeDb({ data: "rate_limited" }), env: env() });
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: "rate_limited" });
  const plain = await handle(form({ email: "a@b.co" }), { db: fakeDb({ data: "rate_limited" }), env: env() });
  assert.equal(plain.headers.get("location"), "https://stashtag.ai/waitlist/try-again/");
  const origError = console.error;
  console.error = () => {};
  const broken = await handle(form({ email: "a@b.co" }, asJson), { db: fakeDb({ error: { code: "XX000" } }), env: env() });
  console.error = origError;
  assert.equal(broken.status, 500);
}

// Other origins, other methods, oversized bodies
{
  const db = fakeDb();
  assert.equal((await handle(form({ email: "a@b.co" }, { origin: "https://evil.example" }), { db, env: env() })).status, 403);
  assert.equal((await handle(form({ email: "a@b.co" }, { origin: "null" }), { db: fakeDb(), env: env() })).status, 303, "Origin: null allowed");
  assert.equal((await handle(new Request("https://fn.example/"), { db, env: env() })).status, 405);
  const pre = await handle(new Request("https://fn.example/", { method: "OPTIONS", headers: { origin: SITE } }), { db, env: env() });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), SITE);
  const big = await handle(form({ email: "a@b.co", pad: "x".repeat(MAX_BODY) }, asJson), { db, env: env() });
  assert.equal(big.status, 400);
  assert.equal(db.calls.length, 0);
}

console.log("waitlist: all tests passed");
