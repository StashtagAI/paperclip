// Server-side URL allowlist. Never fetch anything that does not pass this.
export const ALLOWED_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "m.tiktok.com",
]);

const MAX_REDIRECTS = 5;

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

/** Follow redirects manually, re-validating the host at every hop. */
export async function resolveAllowed(
  raw: string,
  fetchFn: typeof fetch = fetch,
): Promise<URL | null> {
  let current = parseAllowedUrl(raw);
  for (let i = 0; current && i <= MAX_REDIRECTS; i++) {
    const res = await fetchFn(current.toString(), { method: "GET", redirect: "manual" });
    await res.body?.cancel();
    if (res.status < 300 || res.status >= 400) return current;
    const loc = res.headers.get("location");
    if (!loc) return null;
    current = parseAllowedUrl(new URL(loc, current).toString());
  }
  return null;
}
