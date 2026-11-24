import {
  buyLinks, config, instacartBody, instacartUrlOk, recipeRequest, shoppingListRequest, type Env, type InstacartRequest,
  type Recipe,
} from "./links.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
export type Deps = { db: Db; env: Env; fetchFn?: typeof fetch };

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

export const INSTACART_TIMEOUT_MS = 10_000;
/** Most recipes on one shopping list, and most ticked-off lines the app can leave out. */
export const MAX_RECIPES = 50;
export const MAX_SKIP = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Distinct strings, or null if it isn't an array of at most `max` that pass `ok`. */
const strings = (v: unknown, max: number, ok: (s: string) => boolean = () => true): string[] | null =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && ok(x)) ? [...new Set(v as string[])] : null;

/** The caller's own recipes, in the order asked, with the ingredients and steps process-link extracted. */
async function ownRecipes(db: Db, userId: string, itemIds: string[]): Promise<Recipe[]> {
  const { data, error } = await db.from("items")
    .select("id, name, link:links!items_link_id_fkey(recipe_details:raw_content->recipe_details)")
    .in("id", itemIds).eq("user_id", userId);
  if (error) throw error;
  const byId = new Map<string, Recipe>();
  for (const it of data ?? []) {
    const d = it.link?.recipe_details?.[it.name];
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
    byId.set(it.id, { name: it.name, ingredients: strings(d?.ingredients), steps: strings(d?.steps) });
  }
  return itemIds.flatMap((id) => byId.get(id) ?? []);
}

export async function handle(req: Request, { db, env, fetchFn = fetch }: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "bad request" }, 400);

  // verify_jwt also accepts the anon key, so resolve the actual user from the token.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  const userId: string | undefined = auth?.user?.id;
  if (!userId) return json({ error: "not signed in" }, 401);

  const cfg = config(env);

  if (body.action === "buy") {
    if (typeof body.item_id !== "string") return json({ error: "item_id required" }, 400);
    const { data: item } = await db.from("items")
      .select("name, description, tags, list:lists!inner(name, category:categories!inner(kind, name))")
      .eq("id", body.item_id).eq("user_id", userId).maybeSingle();
    if (!item) return json({ error: "not found" }, 404);
    if (item.list.category.kind !== "shop") return json({ links: [] });
    const links = buyLinks({
      name: item.name, description: item.description, tags: item.tags,
      list: item.list.name, category: item.list.category.name,
    }, cfg);
    return json({ links });
  }

  if (body.action === "instacart") {
    // The page is built here from the caller's own rows, never from text the client sends (HAN-134): each call mints
    // a page on Instacart under our partner key.
    //   {item_id}              → a recipe page
    //   {item_ids, skip?}      → a shopping list for those recipes, less the line keys ticked off
    const isId = (v: string) => UUID.test(v);
    const recipeId = typeof body.item_id === "string" && isId(body.item_id) ? body.item_id : null;
    const listIds = recipeId ? null : strings(body.item_ids, MAX_RECIPES, isId);
    if (!recipeId && !listIds?.length) return json({ error: "item_id or item_ids required" }, 400);
    const skip = body.skip == null ? [] : strings(body.skip, MAX_SKIP);
    if (!skip) return json({ error: "bad skip" }, 400);
    let recipes: Recipe[];
    try {
      recipes = await ownRecipes(db, userId, recipeId ? [recipeId] : listIds!);
    } catch (e) {
      console.log(`[shop-links] recipes read failed: ${(e as { code?: string }).code ?? "error"}`);
      return json({ error: "server_error" }, 500);
    }
    if (!recipes.length) return json({ error: "not found" }, 404);
    const r: InstacartRequest | null = recipeId ? recipeRequest(recipes[0]) : shoppingListRequest(recipes, skip);
    if (!r) return json({ error: "nothing to send" }, 400);
    if (!cfg.instacartKey) return json({ error: "not_configured" }, 503);

    const { data: q, error: qe } = await db.rpc("claim_instacart_quota", { p_user: userId, p_per_hour: cfg.instacartPerHour });
    if (qe || !q) {
      // Fail closed: no bookkeeping, no page.
      console.log(`[shop-links] quota check failed: ${qe?.code ?? "no data"}`);
      return json({ error: "server_error" }, 500);
    }
    if (!q.allowed) {
      console.log(`[shop-links] ${JSON.stringify({ instacart: "rate_limited", hour_calls: q.hour_calls })}`);
      return json({ error: "rate_limited" }, 429);
    }
    let res: Response;
    try {
      res = await fetchFn(`${cfg.instacartBase}/idp/v1/products/products_link`, {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.instacartKey}`, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(instacartBody(r)),
        signal: AbortSignal.timeout(INSTACART_TIMEOUT_MS),
      });
    } catch (e) {
      console.log(`[shop-links] instacart unreachable: ${(e as Error).name}`);
      return json({ error: "instacart_unavailable" }, 502);
    }
    const out = await res.json().catch(() => null);
    const url = out?.products_link_url;
    if (!res.ok || !instacartUrlOk(url, cfg.instacartBase)) {
      // Instacart's validation errors name the bad field; log them, but never the API key or the list itself.
      console.log(`[shop-links] instacart ${res.status} ${JSON.stringify(out?.errors ?? out?.error ?? null).slice(0, 300)}`);
      return json({ error: "instacart_failed" }, 502);
    }
    console.log(`[shop-links] ${JSON.stringify({ instacart: r.kind, lines: r.lines.length })}`);
    return json({ url });
  }

  return json({ error: "unknown action" }, 400);
}
