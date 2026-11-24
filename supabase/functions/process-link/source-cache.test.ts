// Run: node --experimental-strip-types source-cache.test.ts  (no network)
import assert from "node:assert/strict";
import { parseAllowedUrl } from "./url.ts";
import { publicRaw, sourceKey } from "./source-cache.ts";

const key = (u: string) => sourceKey(parseAllowedUrl(u)!);

// The same post under different spellings shares one key
const ig = "instagram:DABC123_x-Y";
for (const u of [
  "https://www.instagram.com/reel/DABC123_x-Y/",
  "https://instagram.com/reel/DABC123_x-Y",
  "https://www.instagram.com/reel/DABC123_x-Y/?igsh=abc&utm_source=qr",
  "https://www.instagram.com/someone/reel/DABC123_x-Y/",
]) assert.equal(key(u), ig, u);
// /p/ and /reel/ of the same code are the same post
assert.equal(key("https://www.instagram.com/p/DABC123_x-Y/"), ig);
// shortcodes are case-sensitive: different case is a different post
assert.notEqual(key("https://www.instagram.com/p/dabc123_x-y/"), ig);
assert.equal(key("https://www.tiktok.com/@a/video/7300000000000000001?lang=en"), "tiktok:video:7300000000000000001");
assert.equal(key("https://www.tiktok.com/@b/video/7300000000000000001"), "tiktok:video:7300000000000000001");
assert.notEqual(key("https://www.tiktok.com/@a/video/7300000000000000002"), "tiktok:video:7300000000000000001");
// short links are not resolved: they only match themselves
assert.equal(key("https://vm.tiktok.com/ZMabc/"), key("https://vm.tiktok.com/ZMabc"));

// Only post-derived fields are stored; per-user and handler-added keys never are
const stored = publicRaw({
  platform: "instagram", caption: "c", transcript: null, ocr: null, linked_sites: [], item_sources: {}, recipe_details: {}, item_source_urls: {},
  list_id: "L", already_listed: ["x"], fetch: { via: "apify" }, stage: "filing", reading: false, user_id: "U", alt_kind: "shop",
});
assert.deepEqual(Object.keys(stored).sort(), ["caption", "item_source_urls", "item_sources", "linked_sites", "ocr", "platform", "recipe_details", "transcript"]);
console.log("source-cache.test ok");
