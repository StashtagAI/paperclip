// Image posts (HAN-126): a photo or carousel post whose recommendations are in the pictures ("Top 50 places to eat in
// Denver" as a graphic). The caption alone names one or two places, so the images have to be read. Order, cheapest first:
// (A) the phone downloads the images and OCRs them on-device (free, see the capture screen); (B) only if that reads too
// little, this module sends the images to Claude vision. The image URLs come from the Apify result, so they are checked
// against Instagram's CDN hosts and kept server-side (links.raw_content.fetch.images): the client never supplies a URL.
import type { Captured } from "./retrieval.ts";
import { allowedVideoUrl } from "./video.ts";

type Env = (k: string) => string | undefined;

export const IMAGE_LIMITS = { maxImages: 10, maxBytes: 5 * 1024 * 1024, timeoutMs: 45_000, maxOutputTokens: 8_000 };
/** List price estimate for the pre-call budget check: ~1.6k input tokens per image plus a full-length answer. */
const EST_IN_TOK_PER_IMAGE = 1_600;

const off = (v: string | undefined) => v != null && /^(0|false|off|no)$/i.test(v.trim());

/** Image URLs from an Apify Instagram item: carousel children, else `images`, else the single `displayUrl`. Videos: none. */
export function imageRefsFrom(item: Record<string, unknown> | undefined): string[] {
  if (!item || item.videoUrl || /video/i.test(String(item.type ?? ""))) return [];
  const child = Array.isArray(item.childPosts) ? item.childPosts.map((c) => (c as Record<string, unknown> | null)?.displayUrl) : [];
  const flat = Array.isArray(item.images) ? item.images : [];
  const pool = child.filter(Boolean).length ? child : flat.length ? flat : [item.displayUrl];
  const out: string[] = [];
  for (const raw of pool) {
    const u = allowedVideoUrl(raw);
    if (u && !out.includes(u.toString())) out.push(u.toString());
    if (out.length >= IMAGE_LIMITS.maxImages) break;
  }
  return out;
}

/** Same CDN check as videos; used when reading the stored list back, since raw_content is data, not a trusted input. */
export const storedImageRefs = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => allowedVideoUrl(x)?.toString()).filter((x): x is string => !!x).slice(0, IMAGE_LIMITS.maxImages) : [];

const MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function download(u: URL, fetchFn: typeof fetch, signal: AbortSignal): Promise<{ type: string; data: string } | null> {
  const r = await fetchFn(u.toString(), { redirect: "manual", signal });
  const type = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!r.ok || !r.body || !MEDIA.includes(type) || Number(r.headers.get("content-length")) > IMAGE_LIMITS.maxBytes) { await r.body?.cancel(); return null; }
  const chunks: Uint8Array[] = [];
  let n = 0;
  const rd = r.body.getReader();
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    n += value.byteLength;
    if (n > IMAGE_LIMITS.maxBytes) { await rd.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { bytes.set(c, o); o += c.byteLength; }
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { type, data: btoa(s) };
}

const PROMPT = `These are the pictures of one social media post, in order. Transcribe all readable text in them, in reading order, one line per list entry or text line. Copy words exactly as shown, including names, numbers and addresses. Do not summarize, translate, describe the pictures or add anything that is not written in them. If there is no readable text, reply with nothing.`;

export interface ImageRead { captured: Captured; ms: number; cost_usd: number; images: number }
export type ImageSkip = { skipped: string; cost_usd?: number };

/**
 * Reads the text in the post's pictures with Claude vision. `fetchFn` is for the Anthropic call (the run's metered fetch,
 * so it is budgeted and booked); CDN downloads use `plainFetch`. Failures return a skip reason; they never fail the link.
 */
export async function readImages(
  urls: string[],
  env: Env,
  apiKey: string | undefined,
  model: string,
  fetchFn: typeof fetch = fetch,
  plainFetch: typeof fetch = fetch,
  maxUsd = 0.25,
): Promise<ImageRead | ImageSkip> {
  const t0 = Date.now();
  if (off(env("LINK_FETCH_IMAGES")) || off(env("LINK_FETCH_ENABLED"))) return { skipped: "disabled" };
  const refs = storedImageRefs(urls);
  if (!refs.length) return { skipped: "no_images" };
  if (!apiKey) return { skipped: "no_key" };
  if (refs.length * EST_IN_TOK_PER_IMAGE * 2 / 1e6 + IMAGE_LIMITS.maxOutputTokens * 10 / 1e6 > maxUsd) return { skipped: "cost_cap" };
  const signal = AbortSignal.timeout(IMAGE_LIMITS.timeoutMs);
  try {
    const got = (await Promise.all(refs.map((u) => download(new URL(u), plainFetch, signal).catch(() => null)))).filter((x) => !!x);
    if (!got.length) return { skipped: "download_failed" };
    const r = await fetchFn("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: IMAGE_LIMITS.maxOutputTokens,
        messages: [{ role: "user", content: [
          ...got.map((g) => ({ type: "image", source: { type: "base64", media_type: g!.type, data: g!.data } })),
          { type: "text", text: PROMPT },
        ] }],
      }),
      signal,
    });
    if (!r.ok) return { skipped: `vision_${r.status}` };
    const j = await r.json();
    const text = String(j.content?.find((b: { type: string }) => b.type === "text")?.text ?? "").trim().slice(0, 20_000);
    const cost = ((Number(j.usage?.input_tokens) || 0) * 2 + (Number(j.usage?.output_tokens) || 0) * 10) / 1e6;
    return text ? { captured: { ocr: text }, ms: Date.now() - t0, cost_usd: cost, images: got.length } : { skipped: "empty_vision", cost_usd: cost };
  } catch (e) {
    const n = (e as Error).name;
    return { skipped: n === "TimeoutError" || n === "AbortError" ? "timeout" : n === "RunBudgetError" ? "run_budget" : "error" };
  }
}
