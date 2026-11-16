// process-link request handler, served by index.ts. POST {link_id, captured?:{caption?,transcript?,ocr?}}.
// With captured text (from the capture screen) it extracts from that. Without, it first fetches the post's caption
// (fetch-caption.ts, HAN-18); if that fails or yields no items the link goes back to "pending" with
// error "needs_capture" and the app opens the capture screen.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processCaptured } from "./pipeline.ts";
import { buildContent } from "./retrieval.ts";
import { fetchCaption } from "./fetch-caption.ts";
import { parseAllowedUrl, platformOf } from "./url.ts";
import { cachedSearch, type SearchCache, searchFromEnv, stubSearch } from "./search.ts";
import { cachedLookup, lookupFromEnv, type PlaceCache, stubLookup } from "./lookup.ts";
import { findByName, splitNew } from "./merge.ts";
import { book, costDetail, limitsFromEnv, type Meter, meteredFetch, newMeter } from "./quota.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

export interface HandlerDeps {
  /** service-role client: bypasses RLS, so every row this touches must be checked against the caller */
  db: SupabaseClient;
  env: (k: string) => string | undefined;
  /** outbound HTTP (caption fetch, model, linked sites, lookups); tests pass a mock */
  fetchFn?: typeof fetch;
}

interface Run { meter: Meter; record: (() => Promise<void>) | null }

// HAN-37: once a run passes the quota it books its estimated spend ("cost" event) whichever way it ends.
export async function handle(req: Request, deps: HandlerDeps): Promise<Response> {
  const run: Run = { meter: newMeter(), record: null };
  try {
    return await handleRun(req, deps, run);
  } finally {
    await run.record?.();
  }
}

/** Logs the alert and, when ALERT_WEBHOOK_URL is set (Slack-style incoming webhook), posts it there. Never throws. */
async function sendAlert(env: HandlerDeps["env"], fetchFn: typeof fetch, kind: string, userId: string, q: Record<string, unknown>) {
  const text = `StashtagAI process-link alert: ${kind} (user ${userId.slice(0, 8)}, ${q.hour_runs} runs in the last hour, `
    + `$${Number(q.user_usd).toFixed(2)} this user / $${Number(q.all_usd).toFixed(2)} all users today)`;
  console.error(`[process-link] ALERT ${text}`);
  const hook = env("ALERT_WEBHOOK_URL");
  if (!hook) return;
  try {
    await fetchFn(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(5000) });
  } catch { /* alerting is best-effort */ }
}

async function handleRun(req: Request, { db, env, fetchFn = fetch }: HandlerDeps, run: Run): Promise<Response> {
  const { link_id, captured: sent } = await req.json().catch(() => ({}));
  if (typeof link_id !== "string" || !UUID.test(link_id)) return json({ error: "link_id required" }, 400);

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
  const fail = async (code: string, http = 200) => {
    await Promise.allSettled(pending);
    await event("final", false, Date.now() - t00, { status: "failed", error: code });
    await db.from("links").update({ status: "failed", error: code }).eq("id", link_id);
    return json({ status: "failed", error: code }, http);
  };

  // Server-side re-validation: never trust the client check.
  const postUrl = parseAllowedUrl(link.url);
  if (!postUrl) return await fail("url_not_allowed");
  const fetching = !buildContent(link.url, sent);
  // Atomic claim: a double tap (or a retry while a run is in flight) must not start a second run.
  // raw_content.reading lets the app show "Reading the post…" until the caption is in.
  const { data: claimed } = await db.from("links")
    .update({ status: "processing", error: null, ...(fetching ? { raw_content: { reading: true } } : {}) })
    .eq("id", link_id).neq("status", "processing").select("id");
  if (!claimed?.length) return json({ error: "already_processing" }, 409);

  // Rate limit and daily caps, before any paid call. Fails closed: no quota answer, no spend.
  const limits = limitsFromEnv(env);
  const { data: q, error: qe } = await db.rpc("claim_process_quota", {
    p_user: link.user_id, p_link: link_id, p_per_hour: limits.perHour,
    p_user_daily_usd: limits.userDailyUsd, p_global_daily_usd: limits.globalDailyUsd,
  });
  if (qe || !q) {
    console.error(`[process-link] quota check failed: ${qe?.message}`);
    return await fail("quota_unavailable");
  }
  if (q.alert) await sendAlert(env, fetchFn, q.alert, link.user_id, q);
  if (!q.allowed) return await fail(q.reason, 429);
  const meter = run.meter;
  run.record = () => event("cost", meter.refused === 0, undefined, costDetail(meter));
  // Paid calls go through the meter; past the run budget they are refused (search/Places skip, extraction fails).
  const paidFetch = meteredFetch(meter, limits.runUsd, fetchFn);

  // Back to "pending" so the capture screen takes over, keeping whatever caption we got to pre-fill it.
  const needsCapture = async (reason: string, fetch: Record<string, unknown>, caption?: string) => {
    await Promise.allSettled(pending);
    await event("final", true, Date.now() - t00, { status: "needs_capture", reason });
    await db.from("links").update({
      status: "pending",
      error: "needs_capture",
      raw_content: { fetch: { ...fetch, reason }, caption: caption ?? null, caption_source: caption ? "fetched" : null },
    }).eq("id", link_id);
    return json({ status: "needs_capture", reason });
  };

  let captured = sent;
  let fetched: Record<string, unknown> | null = null;
  if (fetching) {
    const f = await fetchCaption(postUrl, env, paidFetch);
    book(meter, f.cost_usd);
    const detail = { platform: platformOf(postUrl), cost_usd: f.cost_usd, ...(f.ok ? { via: f.via, caption_chars: f.caption.length } : { reason: f.reason, tried: f.tried }) };
    await event("fetch_caption", f.ok, f.ms, detail);
    console.log(`[process-link] fetch_caption ${JSON.stringify({ ok: f.ok, ms: f.ms, ...detail })}`);
    if (!f.ok) return await needsCapture(f.reason, { ms: f.ms, cost_usd: f.cost_usd, tried: f.tried });
    fetched = { via: f.via, ms: f.ms, cost_usd: f.cost_usd };
    captured = { caption: f.caption };
  }

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
  const sBase = searchFromEnv(env, paidFetch);
  const base = lookupFromEnv(env, paidFetch);
  try {
    const r = await processCaptured(link.url, captured, { apiKey: env("ANTHROPIC_API_KEY")!, fetchFn: paidFetch, lookup: base === stubLookup ? base : cachedLookup(base, cache), search: sBase === stubSearch ? sBase : cachedSearch(sBase, sCache), log: (m) => console.log(`[process-link] ${m}`), event: sink });
    if (!r.ok) return await fail(r.error);
    // A fetched caption that names nothing (only hashtags, "recipe in bio"…): let the user add what the video says.
    if (fetched && "unsorted" in r) return await needsCapture("no_items", fetched, (captured as { caption: string }).caption);
    if (fetched) r.raw_content = { ...r.raw_content, caption_source: "fetched", fetch: fetched };
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
}
