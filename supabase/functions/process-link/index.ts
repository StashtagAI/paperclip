// Supabase Edge Function. POST {link_id, captured:{caption?,transcript?,ocr?}} (text captured on the phone).
// The server never fetches the Instagram/TikTok post (HAN-11).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processCaptured } from "./pipeline.ts";
import { parseAllowedUrl } from "./url.ts";
import { cachedSearch, type SearchCache, searchFromEnv, stubSearch } from "./search.ts";
import { cachedLookup, lookupFromEnv, type PlaceCache, stubLookup } from "./lookup.ts";
import { findByName, splitNew } from "./merge.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  const { link_id, captured } = await req.json().catch(() => ({}));
  if (!link_id) return json({ error: "link_id required" }, 400);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: link, error: le } = await db.from("links").select("id,url,user_id").eq("id", link_id).single();
  if (le || !link) return json({ error: "link not found" }, 404);
  // The app calls this directly with the user's session (HAN-7). verify_jwt only proves the token is valid (the anon
  // key is too), so check that the caller owns the link before spending model/lookup calls or touching its rows.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user || auth.user.id !== link.user_id) return json({ error: "link not found" }, 404);

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
  // Atomic claim: a double tap (or a retry while a run is in flight) must not start a second run.
  const { data: claimed } = await db.from("links").update({ status: "processing", error: null })
    .eq("id", link_id).neq("status", "processing").select("id");
  if (!claimed?.length) return json({ error: "already_processing" }, 409);

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

    // Merge into existing category/list/items, matching names case-insensitively (merge.ts).
    const { data: cats, error: cle } = await db.from("categories").select("id,name").eq("user_id", link.user_id).eq("kind", ex.kind);
    if (cle) throw cle;
    let cat = findByName(cats ?? [], ex.category);
    if (!cat) {
      const { data, error } = await db.from("categories")
        .upsert({ user_id: link.user_id, kind: ex.kind, name: ex.category }, { onConflict: "user_id,kind,name" })
        .select("id,name").single();
      if (error) throw error;
      cat = data;
    }
    const scope = ex.list_scope ?? ex.category;
    const { data: lists, error: lle } = await db.from("lists").select("id,name,tags").eq("category_id", cat!.id);
    if (lle) throw lle;
    let list = findByName(lists ?? [], scope);
    if (!list) {
      const { data, error } = await db.from("lists")
        .upsert({ user_id: link.user_id, category_id: cat!.id, name: scope, tags: ex.tags }, { onConflict: "user_id,category_id,name" })
        .select("id,name,tags").single();
      if (error) throw error;
      list = data;
    } else if (ex.tags.some((t) => !list!.tags.includes(t))) {
      await db.from("lists").update({ tags: [...new Set([...list.tags, ...ex.tags])] }).eq("id", list.id);
    }
    const { data: existing, error: ee } = await db.from("items").select("name").eq("list_id", list!.id);
    if (ee) throw ee;
    // Items already in the list are kept as they are (no duplicate, no overwrite of the earlier post's details).
    const { fresh, already } = splitNew(ex.items, (existing ?? []).map((i) => i.name));
    if (fresh.length) {
      const { error: ie } = await db.from("items").upsert(
        fresh.map(({ name, description, address, lat, lng }) => ({ name, description, address, lat, lng, list_id: list!.id, link_id, user_id: link.user_id })),
        { onConflict: "list_id,name", ignoreDuplicates: true },
      );
      if (ie) throw ie;
    }
    await db.from("links").update({
      status: "done",
      error: null,
      tags: ex.tags,
      raw_content: { ...r.raw_content, list_id: list!.id, already_listed: already },
      processed_at: new Date().toISOString(),
    }).eq("id", link_id);
    await Promise.allSettled(pending);
    await event("final", true, Date.now() - t00, { status: "done", items: fresh.length, already_listed: already.length });
    return json({ status: "done", items: fresh.length, already_listed: already.length, list_id: list!.id });
  } catch (e) {
    return await fail(String((e as Error).message ?? e).slice(0, 200));
  }
});
