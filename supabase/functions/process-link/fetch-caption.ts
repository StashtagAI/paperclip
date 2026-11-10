// Link-first capture (HAN-18): read the post's caption server-side so a shared link can build a card with no extra
// taps. TikTok: public oEmbed first (free), then Apify. Instagram: Apify only. Any failure returns ok:false and the
// app falls back to the capture screen; it never fails the link.
import { ALLOWED_HOSTS, type Platform, platformOf } from "./url.ts";

export type FetchVia = "tiktok_oembed" | "apify_instagram" | "apify_tiktok";

export type FetchOutcome =
  | { ok: true; caption: string; via: FetchVia; ms: number; cost_usd: number }
  | { ok: false; reason: string; ms: number; cost_usd: number; tried: FetchVia[] };

type Env = (k: string) => string | undefined;

const APIFY = "https://api.apify.com/v2/acts";
// Actors and prices checked against the Apify API on 2026-11-10 (pay per event; the free plan's per-result price).
// `maxChargeUsd` is the run's spend cap. It must be at least the actor's `minimalMaxTotalChargeUsd` or Apify answers
// 400 (clockworks' minimum is $0.50). maxItems=1 still means one result, so a run costs one result's price.
export const ACTORS = {
  instagram: { id: "apify~instagram-scraper", usdPerResult: 2.7 / 1000, maxChargeUsd: 0.05 },
  tiktok: { id: "clockworks~tiktok-scraper", usdPerResult: 3.7 / 1000, maxChargeUsd: 0.5 },
} as const;
type Actor = (typeof ACTORS)[keyof typeof ACTORS];
export const TIMEOUT_MS = 30_000;
const MAX_CAPTION = 20_000;

const off = (v: string | undefined) => v != null && /^(0|false|off|no)$/i.test(v.trim());

/**
 * Kill switches (Supabase secrets): LINK_FETCH_ENABLED turns all fetching off; LINK_FETCH_INSTAGRAM / LINK_FETCH_TIKTOK
 * turn one platform off. Unset means on. Instagram also needs the Apify token (see apifyToken).
 */
export function fetchDisabled(platform: Platform, env: Env): string | null {
  if (off(env("LINK_FETCH_ENABLED"))) return "disabled";
  if (off(env(platform === "instagram" ? "LINK_FETCH_INSTAGRAM" : "LINK_FETCH_TIKTOK"))) return "disabled";
  return null;
}

/** The Apify API token. The board set it as `Scrapely_API_Key`; `APIFY_TOKEN` is the documented name. */
export const TOKEN_SECRETS = ["APIFY_TOKEN", "Scrapely_API_Key", "SCRAPELY_API_KEY"] as const;
export function apifyToken(env: Env): string | undefined {
  for (const k of TOKEN_SECRETS) {
    const v = env(k)?.trim();
    if (v) return v;
  }
  return undefined;
}

const clean = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_CAPTION) : "");

/** Short links (vm.tiktok.com/x, or tiktok.com/t/x from the share sheet) that redirect to the full video URL. */
const isShortLink = (u: URL) => u.hostname.toLowerCase() === "vm.tiktok.com" || /^\/t\/[^/]+\/?$/.test(u.pathname);

/** Resolves a TikTok short link to the full video URL; oEmbed and Apify both want the full one. */
export async function resolveShortLink(u: URL, fetchFn: typeof fetch, signal: AbortSignal): Promise<URL> {
  let cur = new URL(u);
  for (let i = 0; i < 3 && isShortLink(cur); i++) {
    const r = await fetchFn(cur.toString(), { method: "GET", redirect: "manual", signal });
    await r.body?.cancel();
    const loc = r.headers.get("location");
    if (!loc) break;
    const next = new URL(loc, cur);
    // Stay on the allowlisted hosts: never follow a redirect anywhere else.
    if (next.protocol !== "https:" || !ALLOWED_HOSTS.has(next.hostname.toLowerCase())) break;
    cur = next;
  }
  cur.search = "";
  return cur;
}

async function tiktokOembed(u: URL, fetchFn: typeof fetch, signal: AbortSignal): Promise<string> {
  const r = await fetchFn(`https://www.tiktok.com/oembed?url=${encodeURIComponent(u.toString())}`, { signal });
  if (!r.ok) return "";
  // `title` is the caption. As of Nov 2026 TikTok often omits it, so Apify is the fallback.
  return clean(((await r.json().catch(() => ({}))) as { title?: unknown }).title);
}

/** One synchronous actor run; returns the dataset items. Billing is capped at one result and a few cents. */
async function apifyRun(actor: Actor, input: unknown, token: string, fetchFn: typeof fetch, signal: AbortSignal) {
  // Ask Apify to stop the run (and the billing) a little before our own abort.
  const q = new URLSearchParams({
    timeout: String(Math.floor(TIMEOUT_MS / 1000) - 3),
    maxItems: "1",
    maxTotalChargeUsd: String(actor.maxChargeUsd),
  });
  const r = await fetchFn(`${APIFY}/${actor.id}/run-sync-get-dataset-items?${q}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
    signal,
  });
  if (!r.ok) throw new Error(`apify_${r.status}`);
  const items = await r.json();
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

/**
 * Fetches the caption for an allowlisted Instagram/TikTok link. `cost_usd` is an estimate from the actor's list price
 * (results returned x price per result), not Apify's invoice.
 */
export async function fetchCaption(url: URL, env: Env, fetchFn: typeof fetch = fetch, timeoutMs = TIMEOUT_MS): Promise<FetchOutcome> {
  const t0 = Date.now();
  const platform = platformOf(url);
  const tried: FetchVia[] = [];
  let cost = 0;
  const fail = (reason: string): FetchOutcome => ({ ok: false, reason, ms: Date.now() - t0, cost_usd: cost, tried });
  const okay = (caption: string, via: FetchVia): FetchOutcome => ({ ok: true, caption, via, ms: Date.now() - t0, cost_usd: cost });

  const disabled = fetchDisabled(platform, env);
  if (disabled) return fail(disabled);
  const signal = AbortSignal.timeout(timeoutMs);
  const token = apifyToken(env);
  try {
    if (platform === "tiktok") {
      const full = await resolveShortLink(url, fetchFn, signal);
      tried.push("tiktok_oembed");
      const title = await tiktokOembed(full, fetchFn, signal).catch(() => "");
      if (title) return okay(title, "tiktok_oembed");
      if (!token) return fail("empty_caption");
      tried.push("apify_tiktok");
      const items = await apifyRun(ACTORS.tiktok, {
        postURLs: [full.toString()],
        resultsPerPage: 1,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSlideshowImages: false,
        shouldDownloadAvatars: false,
        shouldDownloadMusicCovers: false,
        downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
      }, token, fetchFn, signal);
      cost += items.length * ACTORS.tiktok.usdPerResult;
      const text = clean(items[0]?.text);
      return text ? okay(text, "apify_tiktok") : fail(items[0]?.error ? "not_available" : "empty_caption");
    }

    if (!token) return fail("no_token");
    tried.push("apify_instagram");
    const post = new URL(url);
    post.search = ""; // drop share-tracking params (?igsh=…)
    const items = await apifyRun(ACTORS.instagram, {
      directUrls: [post.toString()],
      resultsType: "posts",
      resultsLimit: 1,
      addParentData: false,
    }, token, fetchFn, signal);
    cost += items.length * ACTORS.instagram.usdPerResult;
    // Private posts, login walls and deleted posts come back as an item with `error` (or no item at all).
    const caption = clean(items[0]?.caption);
    return caption ? okay(caption, "apify_instagram") : fail(items[0]?.error || !items.length ? "not_available" : "empty_caption");
  } catch (e) {
    const name = (e as Error).name;
    return fail(name === "TimeoutError" || name === "AbortError" ? "timeout" : String((e as Error).message ?? e).slice(0, 80));
  }
}
