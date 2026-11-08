import { parseAllowedUrl, platformOf } from "./url.ts";
import type { Platform } from "./url.ts";

/** Text captured ON THE PHONE (OCR, transcript, pasted caption). The server never fetches the post itself. */
export interface Captured {
  caption?: string;
  transcript?: string;
  ocr?: string;
}

export interface Content extends Captured {
  platform: Platform;
  url: string;
}

const MAX_FIELD = 20_000;
const clip = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_FIELD) || undefined : undefined);

/** Validates the source link and the captured payload. Returns null if the link is not allowed or no text was captured. */
export function buildContent(rawUrl: string, captured: unknown): Content | null {
  const url = parseAllowedUrl(rawUrl);
  if (!url || !captured || typeof captured !== "object") return null;
  const c = captured as Record<string, unknown>;
  const out: Content = {
    platform: platformOf(url),
    url: url.toString(),
    caption: clip(c.caption),
    transcript: clip(c.transcript),
    ocr: clip(c.ocr),
  };
  return out.caption || out.transcript || out.ocr ? out : null;
}
