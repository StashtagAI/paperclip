import { buyLinks, config, instacartBody, parseInstacart, type Env } from "./links.ts";

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
    const r = parseInstacart(body);
    if (!r) return json({ error: "nothing to send" }, 400);
    if (!cfg.instacartKey) return json({ error: "not_configured" }, 503);
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
    if (!res.ok || typeof url !== "string" || !url.startsWith("https://")) {
      // Instacart's validation errors name the bad field; log them, but never the API key or the list itself.
      console.log(`[shop-links] instacart ${res.status} ${JSON.stringify(out?.errors ?? out?.error ?? null).slice(0, 300)}`);
      return json({ error: "instacart_failed" }, 502);
    }
    console.log(`[shop-links] ${JSON.stringify({ instacart: r.kind, lines: r.lines.length })}`);
    return json({ url });
  }

  return json({ error: "unknown action" }, 400);
}
