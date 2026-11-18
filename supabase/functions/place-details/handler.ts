import { limitsFromEnv } from "../process-link/quota.ts";
import { fetchDetails, type Fetched, type ItemQuery } from "./details.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
export type Deps = { db: Db; env: (k: string) => string | undefined; fetchFn?: typeof fetch };

/** Hours and ratings change; a week keeps them current without calling Google on every visit. */
export const STALE_DAYS = 7;
/** Most items looked up per call; a longer list fills in over the next visits. */
export const MAX_ITEMS = 15;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

type ItemRow = { id: string; name: string; address: string | null; lat: number | null; lng: number | null; google_place_id: string | null };

export async function handle(req: Request, { db, env, fetchFn }: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const { list_id } = await req.json().catch(() => ({}));
  if (typeof list_id !== "string") return json({ error: "list_id required" }, 400);

  // verify_jwt also accepts the anon key, so resolve the actual user from the token.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  const userId: string | undefined = auth?.user?.id;
  if (!userId) return json({ error: "not signed in" }, 401);

  const { data: list } = await db.from("lists").select("id, name, category:categories!inner(kind)")
    .eq("id", list_id).eq("user_id", userId).maybeSingle();
  if (!list) return json({ error: "not found" }, 404);
  if (list.category.kind !== "eats") return json({ updated: 0, remaining: 0 });

  const apiKey = env("GOOGLE_PLACES_API_KEY");
  if (!apiKey) return json({ updated: 0, remaining: 0, skipped: "no_key" });

  const cutoff = new Date(Date.now() - STALE_DAYS * 864e5).toISOString();
  const { data: due, error: de, count } = await db.from("items")
    .select("id, name, address, lat, lng, google_place_id", { count: "exact" })
    .eq("list_id", list_id).eq("user_id", userId)
    .or(`google_checked_at.is.null,google_checked_at.lt.${cutoff}`)
    .order("google_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_ITEMS);
  if (de) return json({ error: "lookup failed" }, 500);
  const items = (due ?? []) as ItemRow[];
  if (!items.length) return json({ updated: 0, remaining: 0 });

  // Counts toward the same daily spend caps as process-link (HAN-37).
  const limits = limitsFromEnv(env);
  const day = new Date(new Date().toISOString().slice(0, 10)).toISOString();
  const { data: costs } = await db.from("process_events").select("user_id, detail")
    .eq("source", "function").eq("stage", "cost").gte("created_at", day);
  const spent = (rows: { detail: { usd?: number } }[]) => rows.reduce((s, r) => s + (Number(r.detail?.usd) || 0), 0);
  const all = (costs ?? []) as { user_id: string; detail: { usd?: number } }[];
  if (spent(all.filter((r) => r.user_id === userId)) >= limits.userDailyUsd || spent(all) >= limits.globalDailyUsd) {
    return json({ updated: 0, remaining: count ?? items.length, skipped: "daily_limit" });
  }

  let usd = 0, updated = 0, failed = 0;
  const one = async (it: ItemRow) => {
    const q: ItemQuery = { name: it.name, address: it.address, hint: list.name, lat: it.lat, lng: it.lng, placeId: it.google_place_id };
    let r: Fetched;
    try { r = await fetchDetails(q, apiKey, fetchFn); } catch { failed++; return; } // try again on a later visit
    usd += r.usd;
    const d = r.details;
    const { error } = await db.from("items").update({
      // A miss clears nothing the user typed; it only records that Google had no match today.
      google_place_id: d?.placeId ?? it.google_place_id,
      google_rating: d?.rating ?? null,
      google_rating_count: d?.ratingCount ?? null,
      opening_hours: d?.hours ?? null,
      google_checked_at: new Date().toISOString(),
    }).eq("id", it.id);
    if (!error && d) updated++;
  };
  // A few at a time: quick for a short list, gentle on Google's per-second quota.
  for (let i = 0; i < items.length; i += 4) await Promise.all(items.slice(i, i + 4).map(one));

  if (usd > 0) {
    await db.from("process_events").insert({
      user_id: userId, source: "function", stage: "cost", ok: true,
      detail: { usd: Math.round(usd * 1e4) / 1e4, fn: "place-details", items: items.length, failed },
    });
  }
  console.log(`[place-details] ${JSON.stringify({ items: items.length, updated, failed, usd })}`);
  return json({ updated, remaining: Math.max(0, (count ?? items.length) - items.length + failed) });
}
