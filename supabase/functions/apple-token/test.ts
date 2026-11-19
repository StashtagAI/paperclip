// Run: node --experimental-strip-types supabase/functions/apple-token/test.ts
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { clientSecret, jwtClaims, revokeStoredAppleTokens } from "../_shared/apple.ts";
import { handle } from "./handler.ts";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const vars: Record<string, string> = {
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_KEY_ID: "KEY1234567",
  // As `supabase secrets set` often stores it: one line with literal \n.
  APPLE_PRIVATE_KEY: pem.replace(/\n/g, "\\n"),
  APPLE_BUNDLE_ID: "ai.stashtag.app",
  APPLE_SERVICES_ID: "ai.stashtag.web",
};
const env = (k: string) => vars[k];

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const idToken = (sub: string) => `${b64url({ alg: "none" })}.${b64url({ sub, aud: "x" })}.sig`;

// clientSecret: an ES256 JWT for Apple that verifies with our public key
{
  const jwt = await clientSecret({ teamId: "TEAM123456", keyId: "KEY1234567", privateKey: pem }, "ai.stashtag.app", 1_700_000_000_000);
  const [h, p, s] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "ES256", kid: "KEY1234567", typ: "JWT" });
  assert.deepEqual(jwtClaims(jwt), { iss: "TEAM123456", iat: 1_700_000_000, exp: 1_700_000_300, aud: "https://appleid.apple.com", sub: "ai.stashtag.app" });
  const key = await crypto.subtle.importKey("spki", publicKey.export({ type: "spki", format: "der" }), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${p}`)), "signature verifies");
}
assert.equal(jwtClaims("not a jwt"), null);

type Sent = { url: string; form: URLSearchParams };
const fakeApple = (reply: { status?: number; body: unknown }, sent: Sent[] = []) =>
  Object.assign(
    (async (url: string, init: RequestInit) => {
      sent.push({ url, form: new URLSearchParams(String(init.body)) });
      return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
    }) as unknown as typeof fetch,
    { sent },
  );

const user = (identities: unknown[]) => ({ id: "user-1", identities });
const appleIdentity = { provider: "apple", id: "apple-sub", identity_data: { sub: "apple-sub" } };
const fakeDb = (u: unknown, rows: unknown[] = [], saved: unknown[] = []) => ({
  saved,
  auth: { getUser: async (t: string) => ({ data: { user: t === "good" ? u : null } }) },
  from: (table: string) => ({
    upsert: async (row: unknown, opts: unknown) => {
      saved.push({ table, row, opts });
      return { error: null };
    },
    select: () => ({ eq: async () => ({ data: rows, error: null }) }),
  }),
});
const req = (body: unknown, auth = "good") =>
  new Request("https://fn/apple-token", { method: "POST", headers: { authorization: `Bearer ${auth}` }, body: JSON.stringify(body) });

// Native code: exchanged with the App ID, checked against the linked Apple account, stored
{
  const db = fakeDb(user([{ provider: "email", id: "x" }, appleIdentity]));
  const apple = fakeApple({ body: { refresh_token: "r1", id_token: idToken("apple-sub") } });
  const res = await handle(req({ authorizationCode: "code-1" }), { db, env, fetchFn: apple });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { saved: true }, "token never echoed");
  assert.equal(apple.sent[0].url, "https://appleid.apple.com/auth/token");
  assert.equal(apple.sent[0].form.get("grant_type"), "authorization_code");
  assert.equal(apple.sent[0].form.get("client_id"), "ai.stashtag.app");
  assert.equal(jwtClaims(apple.sent[0].form.get("client_secret")!)?.sub, "ai.stashtag.app");
  const s = db.saved[0] as { table: string; row: Record<string, string> };
  assert.equal(s.table, "apple_tokens");
  assert.deepEqual([s.row.user_id, s.row.client_id, s.row.refresh_token], ["user-1", "ai.stashtag.app", "r1"]);
}

// OAuth refresh token: checked with the Services ID, kept as given
{
  const db = fakeDb(user([appleIdentity]));
  const apple = fakeApple({ body: { access_token: "a", id_token: idToken("apple-sub") } });
  const res = await handle(req({ refreshToken: "r2" }), { db, env, fetchFn: apple });
  assert.equal(res.status, 200);
  assert.equal(apple.sent[0].form.get("grant_type"), "refresh_token");
  assert.equal(apple.sent[0].form.get("client_id"), "ai.stashtag.web");
  assert.equal((db.saved[0] as { row: { refresh_token: string } }).row.refresh_token, "r2");
}

// Someone else's Apple token is refused and not stored
{
  const db = fakeDb(user([appleIdentity]));
  const res = await handle(req({ authorizationCode: "c" }), { db, env, fetchFn: fakeApple({ body: { refresh_token: "r", id_token: idToken("other") } }) });
  assert.equal(res.status, 403);
  assert.equal(db.saved.length, 0);
}

// Apple says no
{
  const db = fakeDb(user([appleIdentity]));
  const res = await handle(req({ authorizationCode: "c" }), { db, env, fetchFn: fakeApple({ status: 400, body: { error: "invalid_grant" } }) });
  assert.equal(res.status, 400);
  assert.equal(db.saved.length, 0);
}

// No Apple identity, no session, bad bodies, not configured
{
  const never = fakeApple({ body: {} });
  assert.equal((await handle(req({ authorizationCode: "c" }), { db: fakeDb(user([{ provider: "google", id: "g" }])), env, fetchFn: never })).status, 409);
  assert.equal((await handle(req({ authorizationCode: "c" }, "bad"), { db: fakeDb(user([appleIdentity])), env, fetchFn: never })).status, 401);
  for (const body of [{}, { authorizationCode: 1 }, { authorizationCode: "a", refreshToken: "b" }, { refreshToken: "x".repeat(2049) }]) {
    assert.equal((await handle(req(body), { db: fakeDb(user([appleIdentity])), env, fetchFn: never })).status, 400, JSON.stringify(body).slice(0, 40));
  }
  assert.equal((await handle(req({ authorizationCode: "c" }), { db: fakeDb(user([appleIdentity])), env: () => undefined, fetchFn: never })).status, 503);
  assert.equal(never.sent.length, 0, "Apple not called for rejected requests");
  assert.equal((await handle(new Request("https://fn/apple-token", { method: "GET" }), { db: fakeDb(null), env })).status, 405);
}

// delete-account: revokes each stored token with its own client ID; a refusal doesn't throw
{
  const rows = [
    { client_id: "ai.stashtag.app", refresh_token: "r1" },
    { client_id: "ai.stashtag.web", refresh_token: "r2" },
  ];
  const apple = fakeApple({ body: {} });
  assert.equal(await revokeStoredAppleTokens(fakeDb(null, rows), env, "user-1", apple), 2);
  assert.deepEqual(apple.sent.map((s) => [s.url, s.form.get("client_id"), s.form.get("token"), s.form.get("token_type_hint")]), [
    ["https://appleid.apple.com/auth/revoke", "ai.stashtag.app", "r1", "refresh_token"],
    ["https://appleid.apple.com/auth/revoke", "ai.stashtag.web", "r2", "refresh_token"],
  ]);
  const errors = console.error;
  console.error = () => {};
  assert.equal(await revokeStoredAppleTokens(fakeDb(null, rows), env, "user-1", fakeApple({ status: 400, body: {} })), 0);
  assert.equal(await revokeStoredAppleTokens(fakeDb(null, rows), () => undefined, "user-1", apple), 0);
  console.error = errors;
  assert.equal(await revokeStoredAppleTokens(fakeDb(null, []), env, "user-1", apple), 0);
}

console.log("apple-token: all tests passed");
