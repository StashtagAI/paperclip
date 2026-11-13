// HAN-37: per-user rate limit and daily spend caps on process-link. The limits are checked in Postgres
// (claim_process_quota, see the 20261113180000 migration); this module meters what one run spends on paid APIs so the
// run can be stopped at its own budget and its cost recorded for the daily caps.

type Env = (k: string) => string | undefined;

export interface Limits {
  /** links a user can send to process-link per rolling hour */
  perHour: number;
  /** estimated USD one user can spend per UTC day */
  userDailyUsd: number;
  /** estimated USD all users together can spend per UTC day */
  globalDailyUsd: number;
  /** estimated USD one run can spend; paid calls past it are refused */
  runUsd: number;
}

export const DEFAULT_LIMITS: Limits = { perHour: 20, userDailyUsd: 3, globalDailyUsd: 10, runUsd: 1 };

/** Supabase secrets override the defaults; anything missing, non-numeric or negative keeps the default. */
export function limitsFromEnv(get: Env): Limits {
  const num = (k: string, d: number) => {
    const n = Number(get(k)?.trim() || NaN);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  return {
    perHour: Math.floor(num("PROCESS_LINKS_PER_HOUR", DEFAULT_LIMITS.perHour)),
    userDailyUsd: num("PROCESS_USER_DAILY_USD", DEFAULT_LIMITS.userDailyUsd),
    globalDailyUsd: num("PROCESS_GLOBAL_DAILY_USD", DEFAULT_LIMITS.globalDailyUsd),
    runUsd: num("PROCESS_RUN_MAX_USD", DEFAULT_LIMITS.runUsd),
  };
}

// List prices checked 2026-11-13. Estimates, not invoices: the caps only need to be the right order of magnitude.
export const PRICES = {
  /** claude-sonnet-5-5 (extract.ts, search.ts), USD per token */
  anthropicIn: 2 / 1e6,
  anthropicOut: 10 / 1e6,
  /** Claude web search tool, USD per search */
  webSearch: 10 / 1000,
  /** Places API (New) Text Search with the Pro fields lookup.ts asks for, USD per request */
  placesText: 32 / 1000,
  /** Geocoding API, USD per request */
  geocode: 5 / 1000,
} as const;

export interface Meter {
  usd: number;
  anthropic_calls: number;
  input_tokens: number;
  output_tokens: number;
  web_searches: number;
  places_calls: number;
  geocode_calls: number;
  apify_usd: number;
  /** paid calls refused because the run reached its budget */
  refused: number;
}

export const newMeter = (): Meter => ({
  usd: 0, anthropic_calls: 0, input_tokens: 0, output_tokens: 0, web_searches: 0, places_calls: 0, geocode_calls: 0, apify_usd: 0, refused: 0,
});

type Paid = "anthropic" | "places" | "geocode" | "apify";
function paidKind(url: string): Paid | null {
  let host: string;
  try { host = new URL(url).hostname; } catch { return null; }
  if (host === "api.anthropic.com") return "anthropic";
  if (host === "places.googleapis.com") return "places";
  if (host === "maps.googleapis.com") return "geocode";
  if (host === "api.apify.com") return "apify";
  return null;
}

export class RunBudgetError extends Error {
  constructor() { super("run_budget"); this.name = "RunBudgetError"; }
}

/**
 * Wraps fetch for one run: paid calls past `runUsd` throw RunBudgetError (search and Places are best-effort and skip;
 * extraction fails the run), and Anthropic/Google calls are added to the meter. Other hosts (linked sites, TikTok
 * oEmbed) pass through. Apify is priced by fetch-caption's own estimate, booked with `book()`.
 */
export function meteredFetch(m: Meter, runUsd: number, inner: typeof fetch = fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const kind = paidKind(url);
    if (!kind) return inner(input, init);
    if (m.usd >= runUsd) { m.refused++; throw new RunBudgetError(); }
    const res = await inner(input, init);
    if (kind === "places") { m.places_calls++; m.usd += PRICES.placesText; }
    if (kind === "geocode") { m.geocode_calls++; m.usd += PRICES.geocode; }
    if (kind === "anthropic") {
      m.anthropic_calls++;
      try {
        const u = (await res.clone().json())?.usage ?? {};
        const inTok = (Number(u.input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0) + (Number(u.cache_read_input_tokens) || 0);
        const outTok = Number(u.output_tokens) || 0;
        const searches = Number(u.server_tool_use?.web_search_requests) || 0;
        m.input_tokens += inTok;
        m.output_tokens += outTok;
        m.web_searches += searches;
        m.usd += inTok * PRICES.anthropicIn + outTok * PRICES.anthropicOut + searches * PRICES.webSearch;
      } catch { /* error body without usage: nothing billed */ }
    }
    return res;
  }) as typeof fetch;
}

/** Adds fetch-caption's Apify estimate to the meter. */
export function book(m: Meter, apifyUsd: number) {
  m.apify_usd += apifyUsd;
  m.usd += apifyUsd;
}

/** What process_events stores for the run (stage "cost"); the daily caps sum `usd`. */
export const costDetail = (m: Meter) => ({ ...m, usd: Math.round(m.usd * 1e6) / 1e6 });

export type QuotaDecision = { allowed: true; alert: string | null } | { allowed: false; reason: "rate_limited" | "daily_limit"; alert: string | null };
