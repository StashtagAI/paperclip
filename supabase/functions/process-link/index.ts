// Supabase Edge Function. POST {link_id, captured:{caption?,transcript?,ocr?}} (text captured on the phone).
// The server never fetches the Instagram/TikTok post (HAN-11).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processCaptured } from "./pipeline.ts";
import { parseAllowedUrl } from "./url.ts";
import { cachedSearch, type SearchCache, searchFromEnv, stubSearch } from "./search.ts";
import { cachedLookup, lookupFromEnv, type PlaceCache, stubLookup } from "./lookup.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  const { link_id, captured } = await req.json().catch(() => ({}));
  if (!link_id) return json({ error: "link_id required" }, 400);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: link, error: le } = await db.from("links").select("id,url,user_id").eq("id", link_id).single();
  if (le || !link) return json({ error: "link not found" }, 404);

  const t00 = Date.now();
  // Best-effort stage log; never lets logging break processing.
  const event = async (stage: string, ok: boolean, ms: number | undefined, detail: Record<string, unknown> = {}) => {
    try { await db.from("process_events").insert({ link_id, user_id: link.user_id, source: "function", stage, ok, ms, detail }); } catch { /* ignore */ }
  };
  const pending: Promise<void>[] = [];
  const sink = (...a: Parameters<typeof event>) => { pending.push(event(...a)); };
  const fail = async (code: string) => {
    await Promise.allSettled(pending);
    await event("final", false, Date.now() - t00, { status: "failed", error: code });
    await db.from("links").update({ status: "failed", error: code }).eq("id", link_id);
    return json({ status: "failed", error: code });
  };

  // Server-side re-validation: never trust the client check.
  if (!parseAllowedUrl(link.url)) return await fail("url_not_allowed");
  await db.from("links").update({ status: "processing", error: null }).eq("id", link_id);

  // Keyed by normalized "name + list scope"; stores the resolved place incl. place id.
  const cache: PlaceCache = {
    async get(key) {
      const { data } = await db.from("place_lookups").select("place_id,name,address,lat,lng,maps_uri").eq("query_key", key).maybeSingle();
      return data ? { placeId: data.place_id, name: data.name, address: data.address, lat: data.lat ?? undefined, lng: data.lng ?? undefined, mapsUri: data.maps_uri ?? undefined } : null;
    },
    async set(key, p) {
      await db.from("place_lookups").upsert({ query_key: key, place_id: p.placeId, name: p.name, address: p.address, lat: p.lat, lng: p.lng, maps_uri: p.mapsUri });
    },
  };
  const sCache: SearchCache = {
    async get(key) {
      const { data } = await db.from("search_lookups").select("fill").eq("query_key", key).maybeSingle();
      return data?.fill ?? null;
    },
    async set(key, fill) {
      await db.from("search_lookups").upsert({ query_key: key, fill });
    },
  };
  const sBase = searchFromEnv((k) => Deno.env.get(k));
  const base = lookupFromEnv((k) => Deno.env.get(k));
  try {
    const r = await processCaptured(link.url, captured, { apiKey: Deno.env.get("ANTHROPIC_API_KEY")!, lookup: base === stubLookup ? base : cachedLookup(base, cache), search: sBase === stubSearch ? sBase : cachedSearch(sBase, sCache), log: (m) => console.log(`[process-link] ${m}`), event: sink });
    if (!r.ok) return await fail(r.error);
    if ("unsorted" in r) {
      // Unsorted bucket: done + no items + raw_content.unsorted, no empty category/list created.
      await db.from("links").update({ status: "done", error: null, raw_content: r.raw_content, processed_at: new Date().toISOString() }).eq("id", link_id);
      await Promise.allSettled(pending);
      await event("final", true, Date.now() - t00, { status: "done", items: 0, unsorted: true });
      return json({ status: "done", items: 0, unsorted: true });
    }
    const ex = r.extraction;

    const { data: cat, error: ce } = await db.from("categories")
      .upsert({ user_id: link.user_id, kind: ex.kind, name: ex.category }, { onConflict: "user_id,kind,name" })
      .select("id").single();
    if (ce) throw ce;
    const { data: list, error: lie } = await db.from("lists")
      .upsert({ user_id: link.user_id, category_id: cat.id, name: ex.list_scope ?? ex.category, tags: ex.tags },
        { onConflict: "user_id,category_id,name" })
      .select("id").single();
    if (lie) throw lie;
    const { error: ie } = await db.from("items").upsert(
      ex.items.map(({ name, description, address, lat, lng }) => ({ name, description, address, lat, lng, list_id: list.id, link_id, user_id: link.user_id })),
      { onConflict: "list_id,name" },
    );
    if (ie) throw ie;
    await db.from("links").update({
      status: "done",
      error: null,
      tags: ex.tags,
      raw_content: r.raw_content,
      processed_at: new Date().toISOString(),
    }).eq("id", link_id);
    await Promise.allSettled(pending);
    await event("final", true, Date.now() - t00, { status: "done", items: ex.items.length });
    return json({ status: "done", items: ex.items.length });
  } catch (e) {
    return await fail(String((e as Error).message ?? e).slice(0, 200));
  }
});
