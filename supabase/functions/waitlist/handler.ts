// HAN-100: launch waitlist signups from the landing page. See index.ts.

// deno-lint-ignore no-explicit-any
type Db = any;
export type Deps = { db: Db; env: (k: string) => string | undefined };

export const DEFAULT_SITE_URL = "https://stashtag.ai/";
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

/** The caller's IP as Supabase's gateway reports it. */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim() ||
    "unknown";
}

/** Keyed hash, so the database never holds a raw IP and the hashes can't be reversed by brute force without the key. */
export async function hashIp(ip: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(ip)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Outcome = "ok" | "invalid_email" | "rate_limited" | "server";
const STATUS: Record<Outcome, number> = { ok: 200, invalid_email: 400, rate_limited: 429, server: 500 };

export async function handle(req: Request, { db, env }: Deps): Promise<Response> {
  const site = new URL(env("WAITLIST_SITE_URL") || DEFAULT_SITE_URL);
  const cors = {
    "access-control-allow-origin": site.origin,
    "access-control-allow-headers": "content-type, accept",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "origin",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: { ...cors, allow: "POST, OPTIONS" } });
  // Browsers send Origin on every POST, so this stops other sites from signing people up. curl sends none, and some
  // privacy settings send "null"; both are let through, since they still count toward the per-IP limit.
  const origin = req.headers.get("origin");
  if (origin && origin !== "null" && origin !== site.origin) return new Response("forbidden", { status: 403, headers: cors });

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

  const key = env("WAITLIST_IP_SALT") || env("SUPABASE_SERVICE_ROLE_KEY") || "";
  const { data, error } = await db.rpc("waitlist_signup", {
    p_email: email,
    p_platform: platform,
    p_source: source,
    p_utm: utm,
    p_ip_hash: await hashIp(clientIp(req), key),
  });
  if (error) {
    console.error("waitlist_signup failed", error.code ?? error.message);
    return reply("server");
  }
  // Already on the list is also "ok", so the form never reveals whether an address signed up before.
  return reply(data === "rate_limited" ? "rate_limited" : "ok");
}
