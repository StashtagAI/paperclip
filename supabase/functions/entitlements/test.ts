// Run: node --experimental-strip-types supabase/functions/entitlements/test.ts
import assert from "node:assert/strict";
import { eventUserIds, handle, premiumFrom } from "./handler.ts";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const U = "00000000-0000-4000-8000-00000000000a";
const V = "00000000-0000-4000-8000-00000000000b";
const HOOK = "w".repeat(40);

const sub = (expires: string | null, opts: { sandbox?: boolean; grace?: string; id?: string } = {}) => ({
  entitlements: { [opts.id ?? "premium"]: { expires_date: expires, grace_period_expires_date: opts.grace ?? null, product_identifier: "annual" } },
  subscriptions: { annual: { is_sandbox: !!opts.sandbox, store: "app_store" } },
});

// premiumFrom
assert.deepEqual(premiumFrom(sub("2027-11-24T12:00:00Z"), NOW, false), { active: true, expires_at: "2027-11-24T12:00:00.000Z", product_id: "annual", store: "app_store" });
assert.deepEqual(premiumFrom(sub("2026-11-24T11:00:00Z"), NOW, false), { active: false }, "expired");
assert.equal(premiumFrom(sub("2026-11-24T11:00:00Z", { grace: "2026-11-30T00:00:00Z" }), NOW, false).active, true, "billing grace period");
assert.equal(premiumFrom(sub(null), NOW, false).active, true, "no expiry (lifetime or promotional)");
assert.deepEqual(premiumFrom(sub("2027-01-01T00:00:00Z", { sandbox: true }), NOW, false), { active: false }, "sandbox off by default");
assert.equal(premiumFrom(sub("2027-01-01T00:00:00Z", { sandbox: true }), NOW, true).active, true, "sandbox when allowed");
assert.deepEqual(premiumFrom(sub("2027-01-01T00:00:00Z", { id: "pro" }), NOW, false), { active: false }, "another entitlement");
assert.deepEqual(premiumFrom(sub("not a date"), NOW, false), { active: false });
assert.deepEqual(premiumFrom(undefined, NOW, false), { active: false });

// eventUserIds: only UUIDs, deduplicated, case-folded
assert.deepEqual(eventUserIds({ app_user_id: U, original_app_user_id: "$RCAnonymousID:abc", aliases: [U.toUpperCase(), V], transferred_to: ["x"] }), [U, V]);
assert.deepEqual(eventUserIds(undefined), []);

// ---------- handler ----------
type Row = Record<string, unknown>;
function fakeDb(rows: Row[] = [], users: Record<string, Row> = { good: { id: U } }) {
  const writes: Row[] = [];
  return {
    rows, writes,
    auth: { getUser: async (t: string) => ({ data: { user: users[t] ?? null } }) },
    from: () => {
      let id: unknown;
      const q = {
        select: () => q,
        eq: (_c: string, v: unknown) => ((id = v), q),
        maybeSingle: async () => ({ data: rows.find((r) => r.user_id === id) ?? null, error: null }),
        upsert: async (row: Row) => {
          if (row.user_id === V) return { error: { code: "23503", message: "fk" } };
          writes.push(row);
          const i = rows.findIndex((r) => r.user_id === row.user_id);
          if (i >= 0) rows[i] = row; else rows.push(row);
          return { error: null };
        },
      };
      return q;
    },
  };
}
const rc = (body: unknown, status = 200, seen: string[] = []) =>
  Object.assign((async (url: string, init: RequestInit) => {
    seen.push(`${url} ${(init.headers as Record<string, string>).authorization}`);
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch, { seen });
const vars: Record<string, string> = { REVENUECAT_SECRET_KEY: "sk_test", REVENUECAT_WEBHOOK_SECRET: HOOK };
const req = (auth: string | null, body: unknown = {}, method = "POST") =>
  new Request("http://local/entitlements", { method, headers: auth ? { authorization: auth } : {}, body: method === "POST" ? JSON.stringify(body) : undefined });
const run = (r: Request, db: ReturnType<typeof fakeDb>, fetchFn: typeof fetch, env: Record<string, string> = vars) =>
  handle(r, { db, env: (k) => env[k], fetchFn, now: () => NOW });

{
  // Not configured: nothing to sync.
  const r = await run(req("Bearer good"), fakeDb(), rc({}), {});
  assert.equal(r.status, 503);
}
{
  // The app's sync: the caller's own id goes to RevenueCat with the secret key, and Premium is written.
  const db = fakeDb();
  const f = rc({ subscriber: sub("2027-11-24T12:00:00Z") });
  const r = await run(req("Bearer good"), db, f);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { plan: "premium", expires_at: "2027-11-24T12:00:00.000Z" });
  assert.deepEqual(f.seen, [`https://api.revenuecat.com/v1/subscribers/${U} Bearer sk_test`]);
  assert.equal(db.rows[0].plan, "premium");
  assert.equal(db.rows[0].source, "revenuecat");
}
{
  // The body can't name another account or claim a purchase.
  const db = fakeDb();
  const f = rc({ subscriber: {} });
  const r = await run(req("Bearer good", { user_id: V, plan: "premium", event: { app_user_id: V } }), db, f);
  assert.deepEqual(await r.json(), { plan: "free", expires_at: null });
  assert.deepEqual(f.seen, [`https://api.revenuecat.com/v1/subscribers/${U} Bearer sk_test`]);
  assert.equal(db.writes.length, 0, "no row for a free user who never had one");
}
{
  // No session, a wrong token, an anonymous session or a short/wrong webhook secret: 401 and no RevenueCat call.
  for (const [auth, users] of [[null, undefined], ["Bearer nope", undefined], ["Bearer anon", { anon: { id: U, is_anonymous: true } }], [`Bearer ${HOOK.slice(1)}`, undefined]] as const) {
    const db = fakeDb([], users as Record<string, Row> | undefined);
    const f = rc({});
    const r = await run(req(auth, { event: { app_user_id: U } }), db, f);
    assert.equal(r.status, 401, String(auth));
    assert.equal(f.seen.length, 0);
  }
  // A webhook secret shorter than 32 characters is never accepted.
  const f = rc({});
  assert.equal((await run(req("Bearer short"), fakeDb(), f, { ...vars, REVENUECAT_WEBHOOK_SECRET: "short" })).status, 401);
}
{
  // Expiry: the webhook refreshes each account in the event; an unknown account (FK) is skipped.
  const db = fakeDb([{ user_id: U, plan: "premium", source: "revenuecat", expires_at: "2026-11-01T00:00:00Z" }]);
  const f = rc({ subscriber: sub("2026-11-24T11:00:00Z") });
  const r = await run(req(`Bearer ${HOOK}`, { event: { type: "EXPIRATION", app_user_id: U, aliases: [V, "$RCAnonymousID:x"] } }), db, f);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { synced: 2 });
  assert.equal(f.seen.length, 2);
  assert.equal(db.rows[0].plan, "free");
}
{
  // Manual grants (the board's beta accounts) are left alone.
  const db = fakeDb([{ user_id: U, plan: "premium", source: "manual", expires_at: null }]);
  const r = await run(req("Bearer good"), db, rc({ subscriber: {} }));
  assert.deepEqual(await r.json(), { plan: "premium", expires_at: null });
  assert.equal(db.writes.length, 0);
}
{
  // RevenueCat down: the webhook gets a 500 so RevenueCat retries; the app gets a 502; nothing is written.
  const db = fakeDb([{ user_id: U, plan: "premium", source: "revenuecat", expires_at: "2027-01-01T00:00:00Z" }]);
  assert.equal((await run(req(`Bearer ${HOOK}`, { event: { app_user_id: U } }), db, rc({}, 500))).status, 500);
  assert.equal((await run(req("Bearer good"), db, rc({}, 500))).status, 502);
  assert.equal(db.rows[0].plan, "premium");
}
assert.equal((await run(req(null, undefined, "GET"), fakeDb(), rc({}))).status, 405);

console.log("entitlements ok");
