// Run: node --experimental-strip-types fetch-caption.test.ts  (fetch is mocked; no network)
import assert from "node:assert/strict";
import { ACTORS, apifyToken, fetchCaption, fetchDisabled } from "./fetch-caption.ts";

type Call = { url: string; init?: RequestInit };
function mock(routes: [RegExp, (c: Call) => Response | Promise<Response>][]) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const c = { url: String(input), init };
    calls.push(c);
    const r = routes.find(([re]) => re.test(c.url));
    if (!r) throw new Error(`unexpected fetch ${c.url}`);
    return r[1](c);
  }) as typeof fetch;
  return { fn, calls };
}
const j = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const env = (o: Record<string, string>) => (k: string) => o[k];
const IG = new URL("https://www.instagram.com/reel/ABC123/?igsh=xyz");
const TT = new URL("https://www.tiktok.com/@chef/video/7135066022469782790?is_from_webapp=1");

// kill switches
assert.equal(fetchDisabled("instagram", env({})), null);
assert.equal(fetchDisabled("instagram", env({ LINK_FETCH_ENABLED: "false" })), "disabled");
assert.equal(fetchDisabled("tiktok", env({ LINK_FETCH_TIKTOK: "0" })), "disabled");
assert.equal(fetchDisabled("instagram", env({ LINK_FETCH_TIKTOK: "0" })), null);
{
  const m = mock([]);
  const r = await fetchCaption(IG, env({ LINK_FETCH_ENABLED: "off", APIFY_TOKEN: "t" }), m.fn);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "disabled");
  assert.equal(m.calls.length, 0);
}

// Instagram without a token: no network, needs capture
{
  const m = mock([]);
  const r = await fetchCaption(IG, env({}), m.fn);
  assert.deepEqual([r.ok, !r.ok && r.reason, m.calls.length], [false, "no_token", 0]);
}

// token secret names: APIFY_TOKEN wins, then the board's Scrapely_API_Key
{
  assert.equal(apifyToken(env({})), undefined);
  assert.equal(apifyToken(env({ Scrapely_API_Key: " k " })), "k");
  assert.equal(apifyToken(env({ SCRAPELY_API_KEY: "k" })), "k");
  assert.equal(apifyToken(env({ APIFY_TOKEN: "a", Scrapely_API_Key: "k" })), "a");
  assert.equal(apifyToken(env({ APIFY_TOKEN: " ", Scrapely_API_Key: "k" })), "k");
  const m = mock([[/api\.apify\.com/, () => j([{ caption: "Tacos" }])]]);
  const r = await fetchCaption(IG, env({ Scrapely_API_Key: "k" }), m.fn);
  assert.equal(r.ok && r.caption, "Tacos");
  assert.equal((m.calls[0].init?.headers as Record<string, string>).authorization, "Bearer k");
}

// Instagram via Apify: caption returned, share params stripped, token in header (not the URL), billing capped
{
  const m = mock([[/api\.apify\.com/, () => j([{ caption: "  Best tacos in Denver: Tacos Tequila Whiskey  ", shortCode: "ABC123" }])]]);
  const r = await fetchCaption(IG, env({ APIFY_TOKEN: "secret" }), m.fn);
  assert.ok(r.ok);
  assert.equal(r.ok && r.caption, "Best tacos in Denver: Tacos Tequila Whiskey");
  assert.equal(r.ok && r.via, "apify_instagram");
  assert.equal(r.cost_usd, ACTORS.instagram.usdPerResult);
  const c = m.calls[0];
  assert.match(c.url, /\/acts\/apify~instagram-scraper\/run-sync-get-dataset-items\?/);
  assert.match(c.url, /maxItems=1/);
  assert.doesNotMatch(c.url, /secret/);
  assert.equal((c.init?.headers as Record<string, string>).authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(String(c.init?.body)).directUrls, ["https://www.instagram.com/reel/ABC123/"]);
  assert.equal(IG.search, "?igsh=xyz"); // caller's URL untouched
}

// Instagram private / login wall / empty caption / actor error / no items
for (const [reply, reason] of [
  [j([{ error: "restricted_page", errorDescription: "Private" }]), "not_available"],
  [j([]), "not_available"],
  [j([{ caption: "   " }]), "empty_caption"],
  [j({ error: { type: "actor-is-not-rented" } }, 403), "apify_403"],
] as const) {
  const m = mock([[/api\.apify\.com/, () => reply.clone()]]);
  const r = await fetchCaption(IG, env({ APIFY_TOKEN: "t" }), m.fn);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, reason);
}

// timeout: abort is reported as "timeout", not thrown
{
  const hang = (c: { init?: RequestInit }) =>
    new Promise<Response>((_, reject) => c.init?.signal?.addEventListener("abort", () => reject(c.init!.signal!.reason)));
  const m = mock([[/api\.apify\.com/, hang]]);
  const alive = setTimeout(() => {}, 5000); // Node unrefs AbortSignal.timeout's timer; keep the loop up
  const r = await fetchCaption(IG, env({ APIFY_TOKEN: "t" }), m.fn, 50);
  clearTimeout(alive);
  assert.equal(!r.ok && r.reason, "timeout");
}

// TikTok: oEmbed title wins, Apify not called
{
  const m = mock([[/tiktok\.com\/oembed/, () => j({ title: "3 cafés in Lisbon: Fábrica, Copenhagen Coffee Lab, Hello Kristof" })]]);
  const r = await fetchCaption(TT, env({ APIFY_TOKEN: "t" }), m.fn);
  assert.ok(r.ok && r.via === "tiktok_oembed");
  assert.equal(r.cost_usd, 0);
  assert.equal(m.calls.length, 1);
  assert.match(m.calls[0].url, /oembed\?url=https%3A%2F%2Fwww\.tiktok\.com%2F%40chef%2Fvideo%2F7135066022469782790$/);
}

// TikTok: oEmbed without title -> Apify `text`; no token -> empty_caption (no Apify call)
{
  const m = mock([[/tiktok\.com\/oembed/, () => j({ type: "video" })], [/api\.apify\.com/, () => j([{ text: "Shakshuka: 4 eggs, 1 can tomatoes" }])]]);
  const r = await fetchCaption(TT, env({ APIFY_TOKEN: "t" }), m.fn);
  assert.ok(r.ok && r.via === "apify_tiktok" && r.caption.startsWith("Shakshuka"));
  assert.match(m.calls[1].url, /clockworks~tiktok-scraper/);
  assert.equal(JSON.parse(String(m.calls[1].init?.body)).shouldDownloadVideos, false);

  const m2 = mock([[/tiktok\.com\/oembed/, () => j({}, 400)]]);
  const r2 = await fetchCaption(TT, env({}), m2.fn);
  assert.equal(!r2.ok && r2.reason, "empty_caption");
  assert.equal(m2.calls.length, 1);
}

// vm.tiktok.com short link: follow redirects on allowlisted hosts only
{
  const m = mock([
    [/vm\.tiktok\.com/, () => new Response(null, { status: 301, headers: { location: "https://www.tiktok.com/@chef/video/1?_t=x" } })],
    [/tiktok\.com\/oembed/, () => j({ title: "caption" })],
  ]);
  const r = await fetchCaption(new URL("https://vm.tiktok.com/ZMabc/"), env({}), m.fn);
  assert.ok(r.ok);
  assert.match(m.calls[1].url, /url=https%3A%2F%2Fwww\.tiktok\.com%2F%40chef%2Fvideo%2F1$/);

  const evil = mock([
    [/vm\.tiktok\.com/, () => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } })],
    [/tiktok\.com\/oembed/, () => j({})],
  ]);
  await fetchCaption(new URL("https://vm.tiktok.com/ZMabc/"), env({}), evil.fn);
  assert.ok(evil.calls.every((c) => !c.url.includes("169.254")));
}

console.log("fetch-caption tests passed");
