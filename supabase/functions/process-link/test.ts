// Run: node --experimental-strip-types test.ts
import assert from "node:assert/strict";
import { parseAllowedUrl, resolveAllowed } from "./url.ts";
import { validateExtraction } from "./schema.ts";

for (const ok of ["https://www.instagram.com/reel/abc/", "https://vm.tiktok.com/ZM123/", "https://tiktok.com/@a/video/1"])
  assert.ok(parseAllowedUrl(ok), ok);
for (const bad of [
  "http://instagram.com/p/x", "https://instagram.com.evil.com/p/x", "https://evil.com/instagram.com",
  "https://user@instagram.com/p/x", "https://instagram.com:8443/p/x", "https://l.instagram.com/x",
  "https://169.254.169.254/", "javascript:alert(1)", "not a url", "https://notinstagram.com/p/x",
]) assert.equal(parseAllowedUrl(bad), null, bad);

// redirect off allowlist is rejected; on allowlist followed
const mk = (loc: string | null, status = 302) => async () =>
  new Response(null, { status, headers: loc ? { location: loc } : {} });
assert.equal(await resolveAllowed("https://vm.tiktok.com/x", mk("https://evil.com/")), null);
assert.equal(await resolveAllowed("https://vm.tiktok.com/x", mk("http://www.tiktok.com/a")), null);
let n = 0;
const hop = (async () => (n++ === 0
  ? new Response(null, { status: 301, headers: { location: "https://www.tiktok.com/@a/video/1" } })
  : new Response(null, { status: 200 }))) as unknown as typeof fetch;
assert.equal((await resolveAllowed("https://vm.tiktok.com/x", hop))?.pathname, "/@a/video/1");

// schema
const v = validateExtraction({
  kind: "eats", category: "Restaurants", list_scope: "Denver", tags: ["Brunch", "brunch"],
  items: [{ name: "A", description: "good", lat: 999, lng: 1 }, { name: "" }, { name: "B", description: "x", address: "1 Main", lat: 39.7, lng: -105 }],
});
assert.equal(v.items.length, 2);
assert.equal(v.items[0].lat, undefined);
assert.equal(v.items[1].lat, 39.7);
assert.deepEqual(v.tags, ["brunch"]);
assert.throws(() => validateExtraction({ kind: "food", category: "x", items: [] }));
console.log("ok");
