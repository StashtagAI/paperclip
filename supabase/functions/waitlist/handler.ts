// HAN-100: launch waitlist signups from the landing page. See index.ts.

// deno-lint-ignore no-explicit-any
type Db = any;
export type Deps = { db: Db; env: (k: string) => string | undefined };

export const DEFAULT_SITE_URL = "https://stashtag.ai/";
/** Pages that may post to the function, besides WAITLIST_SITE_URL's origin. WAITLIST_ALLOWED_ORIGINS replaces this. */
export const DEFAULT_ALLOWED_ORIGINS = ["https://stashtag.ai", "https://www.stashtag.ai"];
// Cloudflare Pages preview deployments of this project only: https://<8-hex hash>.stashtag-landing.pages.dev. Anchored
// on the exact project subdomain, because anyone can deploy to *.pages.dev. Branch aliases (<branch>.stashtag-landing…)
// are not accepted.
export const PREVIEW_ORIGIN = /^https:\/\/[0-9a-f]{8}\.stashtag-landing\.pages\.dev$/;
/** The landing form sends well under 1 KB; anything bigger isn't from it. */
export const MAX_BODY = 4096;
/** Where the no-JavaScript form lands. Static pages built by landing/build.mjs. */
export const THANKS_PATH = "waitlist/thanks/";
export const TRY_AGAIN_PATH = "waitlist/try-again/";

const PLATFORMS = new Set(["ios", "android"]);
const SOURCES = new Set(["hero", "cta", "try-again"]);
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
// The HTML spec's type="email" rule (what the browser checks before submitting), plus a dot in the domain.
const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Lowercased, trimmed email, or null if it isn't one. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || email.split("@")[0].length > 64 || !EMAIL.test(email)) return null;
  return email;
}

/**
 * The one header we trust for the caller's IP. It must be one the Supabase gateway sets itself, overwriting whatever the
 * client sent; a header the client can set would let a script send a new "IP" each time and skip the per-IP limit.
 * HAN-106: PENDING VERIFICATION. Probe the hosted gateway (see HAN-106) and record the finding here before deploying.
 */
export const CLIENT_IP_HEADER = "x-real-ip";
const IP = /^[0-9a-f.:]{2,45}$/i;

/** The caller's IP from CLIENT_IP_HEADER, or null if it's missing or isn't an IP. No fallbacks, no shared bucket. */
export function clientIp(req: Request): string | null {
  const ip = req.headers.get(CLIENT_IP_HEADER)?.trim() ?? "";
  return IP.test(ip) ? ip : null;
}

/** Keyed hash, so the database never holds a raw IP and the hashes can't be reversed by brute force without the key. */
export async function hashIp(ip: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(ip)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Outcome = "ok" | "invalid_email" | "rate_limited" | "server";
const STATUS: Record<Outcome, number> = { ok: 200, invalid_email: 400, rate_limited: 429, server: 500 };

/** Exact origins allowed to post: the site's own, plus WAITLIST_ALLOWED_ORIGINS (comma-separated) or the defaults. */
export function allowedOrigins(site: URL, list: string | undefined): Set<string> {
  const extra = list ? list.split(",").map((o) => o.trim()).filter(Boolean) : DEFAULT_ALLOWED_ORIGINS;
  const origins = new Set([site.origin]);
  for (const o of extra) {
    try {
      origins.add(new URL(o).origin);
    } catch {
      console.error("WAITLIST_ALLOWED_ORIGINS: not a URL", o);
    }
  }
  return origins;
}

export async function handle(req: Request, { db, env }: Deps): Promise<Response> {
  const site = new URL(env("WAITLIST_SITE_URL") || DEFAULT_SITE_URL);
  // Browsers send Origin on every POST, so this stops other sites from signing people up. A missing Origin (curl and
  // other non-browser clients) is let through; it still counts toward the per-IP limit. "null" is refused: any page
  // can make a browser send it (no-referrer, sandboxed iframe), and our own pages never do, since they send
  // Referrer-Policy: strict-origin-when-cross-origin.
  const origin = req.headers.get("origin");
  const allowed = origin !== null && (allowedOrigins(site, env("WAITLIST_ALLOWED_ORIGINS")).has(origin) || PREVIEW_ORIGIN.test(origin));
  const cors: Record<string, string> = {
    ...(allowed ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-headers": "content-type, accept",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "origin",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: { ...cors, allow: "POST, OPTIONS" } });
  if (origin !== null && !allowed) return new Response("forbidden", { status: 403, headers: cors });

  // The enhanced form asks for JSON; the plain HTML form gets a redirect to a thank-you or try-again page.
  const wantsJson = /application\/json/.test(req.headers.get("accept") ?? "");
  const reply = (outcome: Outcome) =>
    wantsJson
      ? new Response(JSON.stringify(outcome === "ok" ? { ok: true } : { error: outcome }), {
        status: STATUS[outcome],
        headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
      })
      : new Response(null, {
        status: 303,
        headers: { ...cors, location: new URL(outcome === "ok" ? THANKS_PATH : TRY_AGAIN_PATH, site).href, "cache-control": "no-store" },
      });

  // Content-Length first, so an oversized body isn't read at all; the length check after covers chunked bodies.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return reply("invalid_email");
  const body = await req.text().catch(() => "");
  if (body.length > MAX_BODY) return reply("invalid_email");
  let fields: Record<string, unknown>;
  if (/application\/json/.test(req.headers.get("content-type") ?? "")) {
    try {
      const parsed = JSON.parse(body);
      fields = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      fields = {};
    }
  } else {
    fields = Object.fromEntries(new URLSearchParams(body));
  }

  // Honeypot: a field people never see. A bot that fills it is told it worked, and nothing is stored.
  if (typeof fields.website === "string" && fields.website.trim()) return reply("ok");

  const email = normalizeEmail(fields.email);
  if (!email) return reply("invalid_email");
  const platform = typeof fields.platform === "string" && PLATFORMS.has(fields.platform) ? fields.platform : null;
  const source = typeof fields.source === "string" && SOURCES.has(fields.source) ? fields.source : null;
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = fields[k];
    if (typeof v === "string" && v.trim()) utm[k] = v.trim().slice(0, 100);
  }

  // Its own secret, not the service-role key, so rotating that key doesn't reset every rate-limit bucket.
  const salt = env("WAITLIST_IP_SALT");
  if (!salt) {
    console.error("waitlist: WAITLIST_IP_SALT is not set");
    return reply("server");
  }
  const ip = clientIp(req);
  if (!ip) {
    // Never pool callers without an IP into one bucket: filling it would lock everyone out.
    console.error(`waitlist: no client IP in ${CLIENT_IP_HEADER}`);
    return reply("server");
  }
  const { data, error } = await db.rpc("waitlist_signup", {
    p_email: email,
    p_platform: platform,
    p_source: source,
    p_utm: utm,
    p_ip_hash: await hashIp(ip, salt),
  });
  if (error) {
    console.error("waitlist_signup failed", error.code ?? error.message);
    return reply("server");
  }
  if (data === "busy") console.warn("waitlist: global hourly cap reached; check waitlist_attempts for a flood");
  // Already on the list is also "ok", so the form never reveals whether an address signed up before.
  return reply(data === "rate_limited" || data === "busy" ? "rate_limited" : "ok");
}
