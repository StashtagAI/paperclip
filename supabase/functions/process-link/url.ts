// Server-side allowlist for the SOURCE link only. The server never fetches Instagram/TikTok URLs (HAN-11).
export const ALLOWED_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "m.tiktok.com",
]);

export function parseAllowedUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "443") return null;
  if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return null;
  return u;
}

export type Platform = "instagram" | "tiktok";

export function platformOf(u: URL): Platform {
  return u.hostname.endsWith("instagram.com") ? "instagram" : "tiktok";
}
