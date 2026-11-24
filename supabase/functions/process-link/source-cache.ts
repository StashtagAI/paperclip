// HAN-129: one extraction per public post. The first run that reads a post from the server's own fetch stores the
// result; later users who stash the same link reuse it with no Apify, model, Places or search spend.
//
// What goes in: only text the SERVER retrieved from the public post (caption, transcript, OCR from the video read) and
// what was derived from it. Text the user sent (pasted caption, on-device OCR) is never cached, so one user cannot plant
// content that another user's cards are built from. What stays out: user ids, link ids, list ids, anything per-user.
import type { Extraction } from "./schema.ts";
import { platformOf } from "./url.ts";

export interface SourceHit {
  extraction: Extraction;
  /** public fields only (see publicRaw) */
  raw_content: Record<string, unknown>;
}

export interface SourceCache {
  get(key: string): Promise<SourceHit | null>;
  set(key: string, v: SourceHit): Promise<void>;
}

/**
 * Same post, same key: Instagram /p|reel|reels|tv/<code> (also with a /<user>/ prefix) and TikTok /@user/video/<id>
 * collapse to the post id; anything else keeps its lower-cased path. Short links (vm.tiktok.com) are not resolved
 * here, so they only match themselves. `url` must already be normalised by parseAllowedUrl.
 */
export function sourceKey(url: URL): string {
  const platform = platformOf(url);
  const path = url.pathname.replace(/\/+$/, "");
  if (platform === "instagram") {
    const m = path.match(/^(?:\/(?!share\/)[^/]+)?\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (m) return `instagram:${m[1]}`; // shortcodes are case-sensitive
  } else {
    const m = path.match(/\/video\/(\d+)/);
    if (m) return `tiktok:video:${m[1]}`;
  }
  return `${platform}:${url.hostname.replace(/^(www|m)\./, "")}${path.toLowerCase()}`;
}

const PUBLIC_RAW = ["platform", "caption", "transcript", "ocr", "linked_sites", "item_source_urls", "item_sources", "recipe_details"] as const;

/** The post-derived part of a run's raw_content. Handler-added keys (list_id, already_listed, fetch, stage…) are dropped. */
export function publicRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_RAW) if (k in raw) out[k] = raw[k];
  return out;
}

export const SOURCE_CACHE_DAYS = 30;
