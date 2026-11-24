// Run: node --experimental-strip-types video.test.ts  (fetch is mocked; no network)
import assert from "node:assert/strict";
import { allowedVideoUrl, videoReader, videoRefFrom } from "./video.ts";

const env = (o: Record<string, string>) => (k: string) => o[k];
const V = "https://scontent-lax3-1.cdninstagram.com/v/reel.mp4?sig=1";
const mp4 = () => new Response(new Uint8Array(1000), { headers: { "content-length": "1000" } });
function mock(routes: [RegExp, () => Response][]) {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const u = String(input);
    calls.push(u);
    const r = routes.find(([re]) => re.test(u));
    if (!r) throw new Error(`unexpected fetch ${u}`);
    return r[1]();
  }) as typeof fetch;
  return { fn, calls };
}
const gem = (o: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] }));

// URL allowlist: Instagram CDN over https only
assert.ok(allowedVideoUrl(V));
for (const bad of ["http://x.cdninstagram.com/a", "https://evil.com/a", "https://cdninstagram.com.evil.com/a", "https://u@x.fbcdn.net/a", "https://x.fbcdn.net:8443/a", "file:///etc/passwd", 5]) assert.equal(allowedVideoUrl(bad), null, String(bad));
assert.deepEqual(videoRefFrom({ videoUrl: V, videoDuration: 31.5 }), { url: V, durationSec: 31.5 });
assert.equal(videoRefFrom({ videoUrl: "https://evil.com/a" }), undefined);

const keys = env({ OPENAI_API_KEY: "o", GEMINI_API_KEY: "g" });
const ref = { url: V, durationSec: 40 };

// A: transcript; no network until a key and an allowed video exist
{
  const m = mock([[/cdninstagram/, mp4], [/api\.openai\.com/, () => new Response("Number one is Baccarat Rouge 540.\n")]]);
  const r = await videoReader(ref, keys, m.fn).read("transcribe");
  assert.ok("via" in r);
  assert.equal("via" in r && r.captured.transcript, "Number one is Baccarat Rouge 540.");
  assert.ok("via" in r && r.cost_usd > 0 && r.cost_usd < 0.10);
}
for (const [name, e, v, why] of [
  ["kill switch", env({ ...{ OPENAI_API_KEY: "o" }, LINK_FETCH_VIDEO: "false" }), ref, "disabled"],
  ["no key", env({}), ref, "no_key"],
  ["no video", keys, undefined, "no_video"],
  ["too long", keys, { url: V, durationSec: 91 }, "too_long"],
  ["unknown duration", keys, { url: V }, "duration_unknown"],
  ["bad host", keys, { url: "https://evil.com/a", durationSec: 5 }, "no_video"],
] as const) {
  const m = mock([]);
  const r = await videoReader(v, e, m.fn).read("transcribe");
  assert.deepEqual(r, { skipped: why }, name);
  assert.equal(m.calls.length, 0, name);
}

// HAN-126: the limit is the plan's. A 1:55 reel is too long for free (90 s) and read on Premium (150 s); 2:31 is not.
{
  const reel = { url: V, durationSec: 115 };
  assert.deepEqual(await videoReader(reel, keys, mock([]).fn).read("transcribe"), { skipped: "too_long" });
  const m = mock([[/cdninstagram/, mp4], [/api\.openai\.com/, () => new Response("Number one is Santal 33.")]]);
  const r = await videoReader(reel, keys, m.fn, 150).read("transcribe");
  assert.ok("via" in r && r.cost_usd < 0.02, "premium: 1:55 transcribed, about $0.012");
  assert.deepEqual(await videoReader({ url: V, durationSec: 151 }, keys, mock([]).fn, 150).read("transcribe"), { skipped: "too_long" });
}

// redirects are not followed; oversized and failed downloads are skipped without a paid call
{
  const m = mock([[/cdninstagram/, () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } })]]);
  assert.deepEqual(await videoReader(ref, keys, m.fn).read("transcribe"), { skipped: "download_failed" });
  const big = mock([[/cdninstagram/, () => new Response(new Uint8Array(10), { headers: { "content-length": String(30 * 1024 * 1024) } })]]);
  assert.deepEqual(await videoReader(ref, keys, big.fn).read("transcribe"), { skipped: "download_failed" });
  assert.equal(big.calls.length, 1);
}

// B after A: one download for both, speech + on-screen text come back split, empty answers are skips
{
  const m = mock([[/cdninstagram/, mp4], [/api\.openai\.com/, () => new Response("")], [/generativelanguage/, () => gem({ speech: "my top five", on_screen_text: "1. Layton  2. Sauvage" })]]);
  const rd = videoReader(ref, keys, m.fn);
  assert.deepEqual(await rd.read("transcribe"), { skipped: "empty_transcript" });
  const r = await rd.read("vision");
  assert.ok("via" in r);
  assert.deepEqual("via" in r && r.captured, { transcript: "my top five", ocr: "1. Layton  2. Sauvage" });
  assert.equal(m.calls.filter((u) => /cdninstagram/.test(u)).length, 1);
  assert.ok(rd.spent() > 0 && rd.spent() <= 0.10);
  const e = mock([[/cdninstagram/, mp4], [/generativelanguage/, () => gem({ speech: "", on_screen_text: "" })]]);
  assert.deepEqual(await videoReader(ref, keys, e.fn).read("vision"), { skipped: "empty_vision" });
}

// API errors never throw
{
  const m = mock([[/cdninstagram/, mp4], [/api\.openai\.com/, () => new Response("no", { status: 429 })]]);
  assert.deepEqual(await videoReader(ref, keys, m.fn).read("transcribe"), { skipped: "transcribe_429" });
}
console.log("video tests passed");
