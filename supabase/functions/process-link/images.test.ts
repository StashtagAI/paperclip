// Run: npx deno run -A --no-check images.test.ts  (everything mocked; no network)
import assert from "node:assert/strict";
import { imageRefsFrom, readImages, storedImageRefs } from "./images.ts";
import { fetchCaption } from "./fetch-caption.ts";
import { LOOKUP_CONCURRENCY, pool, processCaptured } from "./pipeline.ts";
import { buildContent } from "./retrieval.ts";

const CDN = "https://scontent-iad3-1.cdninstagram.com/v/t51/abc.jpg";
const env = (o: Record<string, string>) => (k: string) => o[k];

// image refs: single image, carousel, videos, hosts that are not Instagram's CDN
assert.deepEqual(imageRefsFrom({ type: "Image", displayUrl: CDN }), [CDN]);
assert.deepEqual(imageRefsFrom({ type: "Sidecar", displayUrl: "https://evil.example/x.jpg", childPosts: [{ displayUrl: CDN }, { displayUrl: CDN + "2" }, { displayUrl: "http://evil.example/y.jpg" }] }), [CDN, CDN + "2"]);
assert.deepEqual(imageRefsFrom({ type: "Video", videoUrl: "https://x.cdninstagram.com/v.mp4", displayUrl: CDN }), []);
assert.deepEqual(imageRefsFrom({ type: "Image", displayUrl: "https://cdninstagram.com.evil.example/x.jpg" }), []);
assert.deepEqual(imageRefsFrom(undefined), []);
assert.equal(imageRefsFrom({ type: "Sidecar", images: Array.from({ length: 30 }, (_, i) => `https://x.fbcdn.net/${i}.jpg`) }).length, 10);
assert.deepEqual(storedImageRefs([CDN, "https://evil.example/a.jpg", 5]), [CDN]);
assert.deepEqual(storedImageRefs("nope"), []);

// fetchCaption passes image URLs through for an image post
{
  const f = (async () => new Response(JSON.stringify([{ caption: "Yelp's Top 50 in Denver: BaekGa", type: "Image", displayUrl: CDN }]), { status: 200 })) as typeof fetch;
  const r = await fetchCaption(new URL("https://www.instagram.com/p/Df5b572iD-_/"), env({ APIFY_TOKEN: "t" }), f);
  assert.ok(r.ok);
  assert.deepEqual(r.images, [CDN]);
}

// readImages: downloads from the CDN only, sends image blocks to Claude, returns the text as OCR
{
  const calls: { url: string; body?: any }[] = [];
  const png = new Uint8Array([137, 80, 78, 71]);
  const plain = (async (u: string | URL) => { calls.push({ url: String(u) }); return new Response(png, { headers: { "content-type": "image/png" } }); }) as typeof fetch;
  const claude = (async (u: string | URL, init?: RequestInit) => {
    calls.push({ url: String(u), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ content: [{ type: "text", text: "1. BaekGa\n2. Sushi Den" }], usage: { input_tokens: 1700, output_tokens: 20 } }));
  }) as typeof fetch;
  const r = await readImages([CDN, "https://evil.example/a.jpg"], env({}), "k", "m", claude, plain);
  assert.ok("captured" in r);
  assert.equal(r.captured.ocr, "1. BaekGa\n2. Sushi Den");
  assert.equal(r.images, 1);
  assert.ok(Math.abs(r.cost_usd - (1700 * 2 + 20 * 10) / 1e6) < 1e-9);
  assert.deepEqual(calls.map((c) => c.url), [CDN, "https://api.anthropic.com/v1/messages"]);
  assert.deepEqual(calls[1].body.messages[0].content.map((b: any) => b.type), ["image", "text"]);
}
// skips: kill switch, no key, no images, non-image bytes, API error
{
  const never = (async () => { throw new Error("no network expected"); }) as typeof fetch;
  assert.deepEqual(await readImages([CDN], env({ LINK_FETCH_IMAGES: "off" }), "k", "m", never, never), { skipped: "disabled" });
  assert.deepEqual(await readImages([CDN], env({}), undefined, "m", never, never), { skipped: "no_key" });
  assert.deepEqual(await readImages(["https://evil.example/a.jpg"], env({}), "k", "m", never, never), { skipped: "no_images" });
  const html = (async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
  assert.deepEqual(await readImages([CDN], env({}), "k", "m", never, html), { skipped: "download_failed" });
  const img = (async () => new Response(new Uint8Array(3), { headers: { "content-type": "image/jpeg" } })) as typeof fetch;
  const e529 = (async () => new Response("{}", { status: 529 })) as typeof fetch;
  assert.deepEqual(await readImages([CDN], env({}), "k", "m", e529, img), { skipped: "vision_529" });
}

// pool: bounded concurrency, and nothing new starts after the deadline
{
  let live = 0, peak = 0;
  const skipped = await pool(Array.from({ length: 50 }, (_, i) => i), LOOKUP_CONCURRENCY, async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 2)); live--; });
  assert.equal(skipped, 0);
  assert.ok(peak > 1 && peak <= LOOKUP_CONCURRENCY);
  let ran = 0;
  assert.equal(await pool([1, 2, 3], 2, async () => { ran++; }, Date.now() - 1), 3);
  assert.equal(ran, 0);
}

// A Top-50 list: all 50 names in the OCR text come through extraction (the HAN-126 case; was cut to 1 / 20)
{
  const names = Array.from({ length: 50 }, (_, i) => `Restaurant Number${i} Grill`);
  const ocr = names.map((n, i) => `${i + 1}. ${n}`).join("\n");
  assert.ok(buildContent("https://www.instagram.com/p/Df5b572iD-_/", { caption: "Yelp's Top 50 Places to Eat in Denver! BaekGa", ocr })?.ocr?.length === ocr.length);
  const fetchFn = (async () => new Response(JSON.stringify({
    content: [{ type: "text", text: JSON.stringify({ kind: "eats", category: "Restaurants", list_scope: "Denver", tags: [], items: names.map((name) => ({ name, description: "Yelp Top 50", sources: { name: "capture" } })) }) }],
  }))) as typeof fetch;
  const r = await processCaptured("https://www.instagram.com/p/Df5b572iD-_/", { caption: "Yelp's Top 50 Places to Eat in Denver!", ocr }, { apiKey: "k", fetchFn });
  assert.ok(r.ok && "extraction" in r);
  assert.equal(r.extraction.items.length, 50);
}
console.log("images tests passed");
