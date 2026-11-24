// HAN-128: website traffic for the admin portal, from Cloudflare Web Analytics on the stashtag.ai Pages project.
// Admins only: the caller's own session must pass public.is_admin(), the same rule admin_stats() uses. The Cloudflare
// token is read-only (Account Analytics: Read) and never leaves this function.
// Secrets: CLOUDFLARE_ANALYTICS_TOKEN, CLOUDFLARE_ACCOUNT_ID. Without them the portal shows "Unavailable".
// Deploy with JWT verification on (the default): supabase functions deploy admin-web-traffic

export type Deps = {
  env: (k: string) => string | undefined;
  /** Whether the bearer of this access token is an admin, asked of Postgres as that user. */
  isAdmin: (token: string) => Promise<boolean>;
  fetchFn?: typeof fetch;
  now?: () => number;
};

/** Production hostnames only: Pages previews (*.stashtag-landing.pages.dev) are us checking our own work. */
export const HOSTS = ["stashtag.ai", "www.stashtag.ai"];
const DAY = 86_400_000;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

type Group = { count?: number; sum?: { visits?: number }; dimensions?: Record<string, string | null> };

// Page views are rows (count); visits are Cloudflare's "visits" (a page view not referred by the same site).
// bot: 0 drops traffic Cloudflare's beacon flags as automated.
export const QUERY = `query ($account: String!, $d1: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!,
  $d7: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!, $d30: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!) {
  viewer { accounts(filter: { accountTag: $account }) {
    d1: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $d1) { count sum { visits } }
    d7: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $d7) { count sum { visits } }
    d30: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $d30) { count sum { visits } }
    pages: rumPageloadEventsAdaptiveGroups(limit: 5, orderBy: [count_DESC], filter: $d30) { count dimensions { requestPath } }
    referrers: rumPageloadEventsAdaptiveGroups(limit: 6, orderBy: [sum_visits_DESC], filter: $d30) { sum { visits } dimensions { refererHost } }
    countries: rumPageloadEventsAdaptiveGroups(limit: 5, orderBy: [sum_visits_DESC], filter: $d30) { sum { visits } dimensions { countryName } }
  } }
}`;

export type WebTraffic =
  | { configured: false }
  | {
      configured: true;
      generated_at: string;
      visits: { d1: number; d7: number; d30: number };
      page_views: { d1: number; d7: number; d30: number };
      top_pages_30d: { path: string; views: number }[];
      top_referrers_30d: { host: string; visits: number }[];
      top_countries_30d: { country: string; visits: number }[];
    };

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Cloudflare's reply → what the portal shows. No rows means no visits, so zeros. */
export function shape(account: Record<string, Group[] | undefined>, nowMs: number): WebTraffic {
  const total = (k: string) => account[k]?.[0];
  const ownSite = (h: string | null | undefined) => !!h && HOSTS.includes(h.toLowerCase());
  return {
    configured: true,
    generated_at: new Date(nowMs).toISOString(),
    visits: { d1: n(total("d1")?.sum?.visits), d7: n(total("d7")?.sum?.visits), d30: n(total("d30")?.sum?.visits) },
    page_views: { d1: n(total("d1")?.count), d7: n(total("d7")?.count), d30: n(total("d30")?.count) },
    top_pages_30d: (account.pages ?? []).map((g) => ({ path: g.dimensions?.requestPath || "/", views: n(g.count) })),
    // An empty referrer is someone typing the address or opening a bookmark; links between our own pages aren't visits.
    top_referrers_30d: (account.referrers ?? [])
      .filter((g) => !ownSite(g.dimensions?.refererHost))
      .slice(0, 5)
      .map((g) => ({ host: g.dimensions?.refererHost || "direct", visits: n(g.sum?.visits) })),
    top_countries_30d: (account.countries ?? []).map((g) => ({ country: g.dimensions?.countryName || "Unknown", visits: n(g.sum?.visits) })),
  };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !(await deps.isAdmin(token).catch(() => false))) return json({ error: "admins only" }, 403);

  const cfToken = deps.env("CLOUDFLARE_ANALYTICS_TOKEN");
  const account = deps.env("CLOUDFLARE_ACCOUNT_ID");
  if (!cfToken || !account) return json({ configured: false });

  const now = (deps.now ?? Date.now)();
  const until = new Date(now).toISOString();
  const since = (days: number) => ({ requestHost_in: HOSTS, bot: 0, datetime_geq: new Date(now - days * DAY).toISOString(), datetime_lt: until });
  try {
    const res = await (deps.fetchFn ?? fetch)("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { authorization: `Bearer ${cfToken}`, "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { account, d1: since(1), d7: since(7), d30: since(30) } }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => null);
    const errors = body?.errors as { message?: string }[] | null | undefined;
    const acct = body?.data?.viewer?.accounts?.[0];
    if (!res.ok || errors?.length || !acct) {
      // Usually a wrong account id or a token without Account Analytics: Read. The message names which.
      console.error("[admin-web-traffic] cloudflare", res.status, errors?.map((e) => e.message).join("; ") ?? "no data");
      return json({ error: "Cloudflare didn’t return analytics. Check the token and account id." }, 502);
    }
    return json(shape(acct, now));
  } catch (e) {
    console.error("[admin-web-traffic] fetch", (e as Error).message);
    return json({ error: "Couldn’t reach Cloudflare." }, 502);
  }
}
