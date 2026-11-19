// Run: node --experimental-strip-types supabase/functions/waitlist/test.ts
import assert from "node:assert/strict";
import { CLIENT_IP_HEADER, clientIp, handle, hashIp, MAX_BODY, normalizeEmail } from "./handler.ts";

// normalizeEmail: lowercases and trims, rejects anything the browser's type="email" check (plus a dotted domain) would
assert.equal(normalizeEmail("  Ana.Lee+trips@Example.COM "), "ana.lee+trips@example.com");
for (const bad of ["", "ana", "ana@", "@example.com", "ana@example", "ana lee@example.com", "ana@exa mple.com",
  "ana@-example.com", "<script>@x.com", `${"a".repeat(65)}@example.com`, `a@${"b".repeat(250)}.com`, 42, null]) {
  assert.equal(normalizeEmail(bad), null, `rejects ${String(bad).slice(0, 30)}`);
}

// clientIp: only the gateway's header; no XFF/other fallbacks, and no shared "unknown" bucket
const ipReq = (headers: Record<string, string>) => new Request("https://x/", { headers });
assert.equal(clientIp(ipReq({ [CLIENT_IP_HEADER]: " 203.0.113.5 " })), "203.0.113.5");
assert.equal(clientIp(ipReq({ [CLIENT_IP_HEADER]: "2001:db8::1" })), "2001:db8::1");
for (const other of ["x-forwarded-for", "cf-connecting-ip", "x-real-ip", "x-client-ip"].filter((h) => h !== CLIENT_IP_HEADER)) {
  assert.equal(clientIp(ipReq({ [other]: "198.51.100.7" })), null, `ignores ${other}`);
}
assert.equal(clientIp(ipReq({})), null);
assert.equal(clientIp(ipReq({ [CLIENT_IP_HEADER]: "not an ip" })), null);
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
const env = (vars: Record<string, string> = {}) => (k: string) =>
  ({ SUPABASE_SERVICE_ROLE_KEY: "service", WAITLIST_IP_SALT: "salt", ...vars } as Record<string, string | undefined>)[k];
const SITE = "https://stashtag.ai";
const form = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request("https://fn.example/functions/v1/waitlist", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: SITE, [CLIENT_IP_HEADER]: "203.0.113.5", ...headers },
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
  assert.equal(p_ip_hash, await hashIp("203.0.113.5", "salt"), "hashes the IP with WAITLIST_IP_SALT");
}

// WAITLIST_SITE_URL moves the redirect and adds its origin to the allowed ones
{
  const db = fakeDb();
  const res = await handle(form({ email: "a@b.co" }, { origin: "http://localhost:8787" }), {
    db,
    env: env({ WAITLIST_SITE_URL: "http://localhost:8787/" }),
  });
  assert.equal(res.headers.get("location"), "http://localhost:8787/waitlist/thanks/");
  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:8787");
}

// No salt, or no client IP: refused and logged, never hashed with the service key or pooled into one bucket
{
  const db = fakeDb();
  const errors: unknown[][] = [];
  const origError = console.error;
  console.error = (...a: unknown[]) => errors.push(a);
  const noSalt = await handle(form({ email: "a@b.co" }, asJson), { db, env: env({ WAITLIST_IP_SALT: "" }) });
  const noIp = await handle(form({ email: "a@b.co" }, { ...asJson, [CLIENT_IP_HEADER]: "" }), { db, env: env() });
  const spoofOnly = await handle(form({ email: "a@b.co" }, { ...asJson, [CLIENT_IP_HEADER]: "", "x-forwarded-for": "1.2.3.4" }), { db, env: env() });
  console.error = origError;
  assert.deepEqual([noSalt.status, noIp.status, spoofOnly.status], [500, 500, 500]);
  assert.equal(errors.length, 3);
  assert.equal(db.calls.length, 0);
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
    method: "POST", headers: { "content-type": "application/json", [CLIENT_IP_HEADER]: "203.0.113.5", ...asJson }, body: JSON.stringify({ email: "A@B.co", platform: "android" }),
  }), { db, env: env() });
  assert.equal(res.status, 200);
  assert.equal(db.calls[0].args.p_email, "a@b.co");
  assert.equal(db.calls[0].args.p_platform, "android");
  const bad = await handle(new Request("https://fn.example/", {
    method: "POST", headers: { "content-type": "application/json", [CLIENT_IP_HEADER]: "203.0.113.5", ...asJson }, body: "{not json",
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

// Origins: exact allowlist plus this project's Pages previews; Origin is echoed only when allowed; "null" refused
{
  const db = fakeDb();
  const status = async (origin: string, vars: Record<string, string> = {}) =>
    (await handle(form({ email: "a@b.co" }, { origin }), { db, env: env(vars) })).status;
  for (const ok of [SITE, "https://www.stashtag.ai", "https://3f2a9c1e.stashtag-landing.pages.dev"]) {
    const res = await handle(form({ email: "a@b.co" }, { ...asJson, origin: ok }), { db, env: env() });
    assert.equal(res.status, 200, `allows ${ok}`);
    assert.equal(res.headers.get("access-control-allow-origin"), ok, `echoes ${ok}`);
    assert.equal(res.headers.get("vary"), "origin");
  }
  for (const bad of [
    "null", "https://evil.example", "http://stashtag.ai", "https://stashtag.ai.evil.example", "https://evilstashtag.ai",
    "https://3f2a9c1e.evil.pages.dev", "https://evil.pages.dev", "https://stashtag-landing.pages.dev",
    "https://main.stashtag-landing.pages.dev", "https://x.3f2a9c1e.stashtag-landing.pages.dev",
    "https://3f2a9c1e.stashtag-landing.pages.dev.evil.example", "http://3f2a9c1e.stashtag-landing.pages.dev",
  ]) {
    assert.equal(await status(bad), 403, `refuses ${bad}`);
  }
  const before = db.calls.length;
  const nullOrigin = await handle(form({ email: "a@b.co" }, { origin: "null" }), { db, env: env() });
  assert.equal(nullOrigin.status, 403, "Origin: null refused");
  assert.equal(nullOrigin.headers.get("access-control-allow-origin"), null, "nothing echoed for a refused origin");
  assert.equal(db.calls.length, before);
  // WAITLIST_ALLOWED_ORIGINS replaces the defaults (the site's own origin always stays)
  const custom = { WAITLIST_ALLOWED_ORIGINS: "https://beta.stashtag.ai, not a url" };
  const origError = console.error;
  console.error = () => {};
  assert.equal(await status("https://beta.stashtag.ai", custom), 303);
  assert.equal(await status("https://www.stashtag.ai", custom), 403);
  assert.equal(await status(SITE, custom), 303);
  console.error = origError;
  // No Origin (curl): let through, no CORS echo
  const { origin: _o, ...noOrigin } = { origin: "", "content-type": "application/x-www-form-urlencoded", [CLIENT_IP_HEADER]: "203.0.113.5" };
  const curl = await handle(new Request("https://fn.example/", { method: "POST", headers: noOrigin, body: "email=a%40b.co" }), { db, env: env() });
  assert.equal(curl.status, 303);
  assert.equal(curl.headers.get("access-control-allow-origin"), null);
}

// Other methods, preflight, oversized bodies
{
  const db = fakeDb();
  assert.equal((await handle(new Request("https://fn.example/"), { db, env: env() })).status, 405);
  const pre = await handle(new Request("https://fn.example/", { method: "OPTIONS", headers: { origin: SITE } }), { db, env: env() });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), SITE);
  const preEvil = await handle(new Request("https://fn.example/", { method: "OPTIONS", headers: { origin: "https://evil.example" } }), { db, env: env() });
  assert.equal(preEvil.headers.get("access-control-allow-origin"), null);
  const big = await handle(form({ email: "a@b.co", pad: "x".repeat(MAX_BODY) }, asJson), { db, env: env() });
  assert.equal(big.status, 400);
  // A Content-Length over the cap is refused before the body is read
  let read = false;
  const declared = form({ email: "a@b.co" }, { ...asJson, "content-length": String(MAX_BODY + 1) });
  const res = await handle(new Proxy(declared, {
    get: (t, p) => p === "text" ? () => { read = true; return t.text(); } : Reflect.get(t, p, t),
  }), { db, env: env() });
  assert.equal(res.status, 400);
  assert.equal(read, false, "body not read");
  assert.equal(db.calls.length, 0);
}

// Global hourly cap: 'busy' looks like rate_limited to the caller, and is logged
{
  const warnings: unknown[][] = [];
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => warnings.push(a);
  const busy = await handle(form({ email: "a@b.co" }, asJson), { db: fakeDb({ data: "busy" }), env: env() });
  console.warn = origWarn;
  assert.equal(busy.status, 429);
  assert.deepEqual(await busy.json(), { error: "rate_limited" });
  assert.equal(warnings.length, 1);
}

console.log("waitlist: all tests passed");
