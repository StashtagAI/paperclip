// HAN-132: keeps public.entitlements in step with RevenueCat, the only place Premium is bought (App Store / Play
// in-app purchase). Two callers, one path:
//   RevenueCat's webhook, with `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`: refreshes every account in the event.
//   The app, with the user's session, right after a purchase or restore: refreshes the caller only.
// Neither caller's word is trusted about what was bought. Each refresh asks RevenueCat's REST API for the customer
// (app user id = Supabase user id) and writes what it says. Manual grants (source 'manual') are never changed here.
// Secrets: REVENUECAT_SECRET_KEY, REVENUECAT_WEBHOOK_SECRET, optional REVENUECAT_ALLOW_SANDBOX=true (TestFlight testing).
// Deploy with --no-verify-jwt: the webhook has no Supabase session, so this checks both kinds of caller itself.

// deno-lint-ignore no-explicit-any
type Db = any;
export type Deps = { db: Db; env: (k: string) => string | undefined; fetchFn?: typeof fetch; now?: () => number };

/** The RevenueCat entitlement identifier that unlocks Premium. */
export const ENTITLEMENT = "premium";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

type RcEntitlement = { expires_date?: string | null; grace_period_expires_date?: string | null; product_identifier?: string };
type RcPurchase = { is_sandbox?: boolean; store?: string };
export type RcSubscriber = {
  entitlements?: Record<string, RcEntitlement>;
  subscriptions?: Record<string, RcPurchase>;
  non_subscriptions?: Record<string, RcPurchase[]>;
};
export type Premium = { active: false } | { active: true; expires_at: string | null; product_id: string | null; store: string | null };

/** Whether RevenueCat's customer has Premium now. Sandbox purchases count only when allowed (testing builds). */
export function premiumFrom(sub: RcSubscriber | undefined, nowMs: number, allowSandbox: boolean): Premium {
  const e = sub?.entitlements?.[ENTITLEMENT];
  if (!e) return { active: false };
  const product = e.product_identifier ?? null;
  const purchase = product ? (sub?.subscriptions?.[product] ?? sub?.non_subscriptions?.[product]?.at(-1)) : undefined;
  if (purchase?.is_sandbox && !allowSandbox) return { active: false };
  const ends = [e.expires_date, e.grace_period_expires_date].filter((d): d is string => !!d).map((d) => Date.parse(d));
  if (ends.some(Number.isNaN)) return { active: false };
  const end = ends.length ? Math.max(...ends) : null;
  if (e.expires_date && end! <= nowMs) return { active: false };
  return { active: true, expires_at: end === null ? null : new Date(end).toISOString(), product_id: product, store: purchase?.store ?? null };
}

/** Account ids a webhook event is about (purchases can move between aliases); only ones that can be Supabase users. */
export function eventUserIds(event: Record<string, unknown> | undefined): string[] {
  if (!event) return [];
  const ids = [event.app_user_id, event.original_app_user_id, event.aliases, event.transferred_from, event.transferred_to]
    .flat()
    .filter((v): v is string => typeof v === "string" && UUID.test(v))
    .map((v) => v.toLowerCase());
  return [...new Set(ids)].slice(0, 10);
}

/** Constant-time string comparison, so the webhook secret can't be guessed a character at a time. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

type Plan = { plan: "free" | "premium"; expires_at: string | null };

/** Asks RevenueCat about one account and writes the answer. Throws when RevenueCat or the database can't answer. */
async function refresh(userId: string, { db, env, fetchFn = fetch, now = Date.now }: Deps, key: string): Promise<Plan | null> {
  const res = await fetchFn(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`revenuecat ${res.status}`);
  const body = await res.json().catch(() => null);
  const p = premiumFrom(body?.subscriber, now(), env("REVENUECAT_ALLOW_SANDBOX") === "true");

  const { data: current, error: re } = await db.from("entitlements").select("source,plan,expires_at").eq("user_id", userId).maybeSingle();
  if (re) throw new Error(`read ${re.message}`);
  if (current?.source === "manual") return { plan: current.plan, expires_at: current.expires_at };
  if (!p.active && !current) return { plan: "free", expires_at: null };
  const row = p.active
    ? { user_id: userId, plan: "premium", source: "revenuecat", product_id: p.product_id, store: p.store, expires_at: p.expires_at }
    : { user_id: userId, plan: "free", source: "revenuecat", product_id: null, store: null, expires_at: null };
  const { error } = await db.from("entitlements").upsert({ ...row, updated_at: new Date(now()).toISOString() }, { onConflict: "user_id" });
  // No such account (an id from another environment, or since deleted): nothing to keep.
  if (error?.code === "23503") return null;
  if (error) throw new Error(`write ${error.message}`);
  return { plan: row.plan as Plan["plan"], expires_at: row.expires_at };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const key = deps.env("REVENUECAT_SECRET_KEY");
  // Until the board sets up RevenueCat, nobody can buy Premium, so there is nothing to sync.
  if (!key) return json({ error: "not configured" }, 503);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const hook = deps.env("REVENUECAT_WEBHOOK_SECRET");

  if (hook && hook.length >= 32 && sameSecret(token, hook)) {
    const body = await req.json().catch(() => ({}));
    const ids = eventUserIds(body?.event);
    try {
      for (const id of ids) await refresh(id, deps, key);
    } catch (e) {
      // A non-2xx reply makes RevenueCat retry the webhook later.
      console.error("[entitlements] webhook", (e as Error).message);
      return json({ error: "sync failed" }, 500);
    }
    return json({ synced: ids.length });
  }

  // verify_jwt is off for this function, and would accept the anon key anyway: resolve the actual user.
  const { data: auth } = token ? await deps.db.auth.getUser(token) : { data: null };
  const user = auth?.user;
  if (!user?.id || user.is_anonymous) return json({ error: "not signed in" }, 401);
  try {
    const plan = await refresh(user.id, deps, key);
    return json(plan ?? { plan: "free", expires_at: null });
  } catch (e) {
    console.error("[entitlements] sync", (e as Error).message);
    return json({ error: "sync failed" }, 502);
  }
}
