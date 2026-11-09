// Server-side allowlist for the SOURCE link only. The server never fetches Instagram/TikTok URLs (HAN-11).
export const ALLOWED_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "m.tiktok.com",
]);

import { checkUrl } from "../_shared/link-filter.ts";

/**
 * Same host and path rules as the app (HAN-19): profiles, encoded CRLF and `\@` host tricks are rejected. Returns
 * the normalised URL (https, lower-case host, no query/fragment); anything fetched downstream must use this, never
 * the raw string.
 */
export function parseAllowedUrl(raw: string): URL | null {
  const r = checkUrl(raw.trim());
  return r.ok ? new URL(r.url) : null;
}

export type Platform = "instagram" | "tiktok";

export function platformOf(u: URL): Platform {
  return u.hostname.endsWith("instagram.com") ? "instagram" : "tiktok";
}
