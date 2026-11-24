// Video fallback (HAN-88): when a post's caption is empty or names no items, read what the video says. The Apify result
// already carries the video URL. Order, cheapest first: (A) download once, transcribe the audio; (B) only if A's text
// gave no items, send the same bytes to a video model that also reads on-screen text. Nothing here runs unless
// LINK_FETCH_VIDEO is on and the matching API key secret exists. Failures return null; they never fail the link.
import type { Captured } from "./retrieval.ts";

type Env = (k: string) => string | undefined;

export interface VideoRef { url: string; durationSec?: number }

export const VIDEO_LIMITS = {
  /** the free plan's length; claim_stash_allowance returns the caller's plan value (HAN-126: Premium 150) */
  maxSeconds: 90,
  maxBytes: 25 * 1024 * 1024,
  /** Gemini inline data: the request (base64, +33%) must stay under ~20 MB */
  maxVisionBytes: 14 * 1024 * 1024,
  /** per-video spend cap in USD (the board's $0.10) */
  maxUsd: 0.10,
  timeoutMs: 45_000,
};

// List prices, NOT yet checked against a real invoice (no keys were available when this was written). Override the
// model with TRANSCRIBE_MODEL / GEMINI_MODEL. Estimates only; the caps need the right order of magnitude.
export const VIDEO_PRICES = {
  transcribePerMin: 0.006,
  geminiInPerTok: 0.30 / 1e6,
  geminiOutPerTok: 2.5 / 1e6,
  /** Gemini counts about 300 tokens per second of video with audio */
  geminiTokPerSec: 300,
} as const;

const off = (v: string | undefined) => v != null && /^(0|false|off|no)$/i.test(v.trim());
const CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;

/** Only Instagram's own CDN hosts over https; the URL comes from a third-party scraper result, so never trust it. */
export function allowedVideoUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.port && !u.username && CDN.test(u.hostname.toLowerCase()) ? u : null;
  } catch { return null; }
}

export function videoRefFrom(item: Record<string, unknown> | undefined): VideoRef | undefined {
  const u = allowedVideoUrl(item?.videoUrl);
  if (!u) return undefined;
  const d = Number(item?.videoDuration);
  return { url: u.toString(), durationSec: Number.isFinite(d) && d > 0 ? d : undefined };
}

export type VideoVia = "transcribe" | "vision";
export interface VideoRead {
  via: VideoVia;
  captured: Captured;
  ms: number;
  cost_usd: number;
}
export type VideoSkip = { skipped: string };

export interface VideoReader {
  /** null reason in `skipped` when the stage did not run or got nothing */
  read(via: VideoVia): Promise<VideoRead | VideoSkip>;
  /** USD spent so far, including failed attempts */
  spent(): number;
}

async function download(u: URL, fetchFn: typeof fetch, signal: AbortSignal): Promise<Uint8Array | null> {
  const r = await fetchFn(u.toString(), { redirect: "manual", signal });
  if (!r.ok || !r.body) { await r.body?.cancel(); return null; }
  const len = Number(r.headers.get("content-length"));
  if (len > VIDEO_LIMITS.maxBytes) { await r.body.cancel(); return null; }
  const chunks: Uint8Array[] = [];
  let n = 0;
  const rd = r.body.getReader();
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    n += value.byteLength;
    if (n > VIDEO_LIMITS.maxBytes) { await rd.cancel(); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

const b64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

const VISION_PROMPT = `Transcribe this short video for a recommendation extractor. Reply with JSON only:
{"speech": "<what is said, verbatim, in order>", "on_screen_text": "<all readable text shown in the video, in order>"}
Copy words exactly. Do not summarize, translate, describe visuals or add anything that is not said or shown. Use "" when there is none.`;

export function videoReader(
  video: VideoRef | undefined, env: Env, fetchFn: typeof fetch = fetch, maxSeconds: number = VIDEO_LIMITS.maxSeconds,
): VideoReader {
  let cost = 0;
  let bytes: Uint8Array | null | undefined;
  const skip = (skipped: string): VideoSkip => ({ skipped });
  const sec = video?.durationSec;

  async function read(via: VideoVia): Promise<VideoRead | VideoSkip> {
    const t0 = Date.now();
    if (off(env("LINK_FETCH_VIDEO")) || off(env("LINK_FETCH_ENABLED"))) return skip("disabled");
    if (!video || !allowedVideoUrl(video.url)) return skip("no_video");
    // Unknown duration is refused: the cap exists to bound spend, so it cannot be skipped by omitting the field.
    if (sec == null) return skip("duration_unknown");
    if (sec > maxSeconds) return skip("too_long");
    const key = via === "transcribe" ? env("OPENAI_API_KEY")?.trim() : env("GEMINI_API_KEY")?.trim();
    if (!key) return skip("no_key");
    const estimate = via === "transcribe"
      ? (sec / 60) * VIDEO_PRICES.transcribePerMin
      : sec * VIDEO_PRICES.geminiTokPerSec * VIDEO_PRICES.geminiInPerTok + 1500 * VIDEO_PRICES.geminiOutPerTok;
    if (cost + estimate > VIDEO_LIMITS.maxUsd) return skip("cost_cap");
    const signal = AbortSignal.timeout(VIDEO_LIMITS.timeoutMs);
    try {
      if (bytes === undefined) bytes = await download(new URL(video.url), fetchFn, signal);
      if (!bytes) return skip("download_failed");
      if (via === "vision" && bytes.byteLength > VIDEO_LIMITS.maxVisionBytes) return skip("too_large");
      cost += estimate; // booked once the paid call is made, even if it returns nothing

      if (via === "transcribe") {
        const form = new FormData();
        form.append("model", env("TRANSCRIBE_MODEL")?.trim() || "gpt-transcribe");
        form.append("response_format", "text");
        form.append("file", new Blob([bytes], { type: "video/mp4" }), "reel.mp4");
        const r = await fetchFn("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form, signal });
        if (!r.ok) return skip(`transcribe_${r.status}`);
        const text = (await r.text()).trim().slice(0, 8_000);
        return text ? { via, captured: { transcript: text }, ms: Date.now() - t0, cost_usd: estimate } : skip("empty_transcript");
      }

      const model = env("GEMINI_MODEL")?.trim() || "gemini-2.5-flash";
      const r = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: "video/mp4", data: b64(bytes) } }, { text: VISION_PROMPT }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
        signal,
      });
      if (!r.ok) return skip(`vision_${r.status}`);
      const body = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const parsed = JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}") as Record<string, unknown>;
      const clip = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 8_000) : "");
      const captured: Captured = { transcript: clip(parsed.speech) || undefined, ocr: clip(parsed.on_screen_text) || undefined };
      return captured.transcript || captured.ocr ? { via, captured, ms: Date.now() - t0, cost_usd: estimate } : skip("empty_vision");
    } catch (e) {
      const n = (e as Error).name;
      return skip(n === "TimeoutError" || n === "AbortError" ? "timeout" : "error");
    }
  }
  return { read, spent: () => cost };
}
