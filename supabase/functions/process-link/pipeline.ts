import { buildContent } from "./retrieval.ts";
import { readLinkedSites, type ResolveFn } from "./linked.ts";
import { extract } from "./extract.ts";
import { type LookupProvider, stubLookup } from "./lookup.ts";
import { type SearchProvider, stubSearch } from "./search.ts";
import type { Extraction } from "./schema.ts";

export interface Deps {
  apiKey: string;
  fetchFn?: typeof fetch;
  /** DNS resolver for linked sites (tests); defaults to Deno.resolveDns */
  resolveFn?: ResolveFn;
  lookup?: LookupProvider;
  search?: SearchProvider;
  /** count-only cost logging */
  log?: (msg: string) => void;
  /** stage events for the process_events table: counts, lengths and item names only */
  event?: (stage: string, ok: boolean, ms: number | undefined, detail: Record<string, unknown>) => void;
}

export type Result =
  | { ok: true; extraction: Extraction; raw_content: Record<string, unknown> }
  | { ok: true; unsorted: true; raw_content: Record<string, unknown> }
  | { ok: false; error: string };

/** url + captured text -> validated, grounded extraction. No DB access, no fetch of the social post. */
export async function processCaptured(url: string, captured: unknown, d: Deps): Promise<Result> {
  const content = buildContent(url, captured);
  if (!content) return { ok: false, error: "no_captured_text" };
  const text = [content.caption, content.transcript, content.ocr].filter(Boolean).join("\n");
  d.event?.("captured", true, undefined, {
    caption_chars: content.caption?.length ?? 0,
    transcript_chars: content.transcript?.length ?? 0,
    ocr_chars: content.ocr?.length ?? 0,
  });
  const t0 = Date.now();
  const linked = await readLinkedSites(text, d.fetchFn, d.resolveFn);
  d.event?.("linked_sites", true, Date.now() - t0, { read: linked.length, urls: linked.map((l) => l.url) });
  const ex = await extract(content, linked, d.apiKey, d.fetchFn, d.event);
  if (!ex.items.length) {
    // Nothing extractable (e.g. items never named): keep the captured text for manual sorting.
    return {
      ok: true,
      unsorted: true,
      raw_content: {
        platform: content.platform,
        caption: content.caption ?? null,
        transcript: content.transcript ?? null,
        ocr: content.ocr ?? null,
        linked_sites: linked.map((l) => l.url),
        unsorted: true,
      },
    };
  }

  const lookup = d.lookup ?? stubLookup;
  const t1 = Date.now();
  for (const it of ex.items) {
    if (ex.kind === "recipes") continue;
    try {
      if (it.address) {
        // address stated in the text or linked data: geocode it, never replace it
        if (it.lat != null || !lookup.geocode) continue;
        const g = await lookup.geocode(it.address);
        if (g) { it.lat = g.lat; it.lng = g.lng; it.sources = { ...it.sources, lat: "places_lookup", lng: "places_lookup" }; }
        continue;
      }
      const p = await lookup.findPlace(it.name, ex.list_scope);
      if (!p) continue;
      it.address = p.address;
      it.sources = { ...it.sources, address: "places_lookup" };
      if (p.lat != null && p.lng != null) { it.lat = p.lat; it.lng = p.lng; it.sources.lat = it.sources.lng = "places_lookup"; }
    } catch { /* lookup is best-effort */ }
  }
  d.event?.("places", true, Date.now() - t1, {
    items: ex.items.length,
    with_address: ex.items.filter((i) => i.address).length,
    with_coords: ex.items.filter((i) => i.lat != null).length,
  });
  const t2 = Date.now();
  const search = d.search ?? stubSearch;
  let searches = 0, cardsSearched = 0;
  for (const it of ex.items) {
    try {
      const out = await search.research(it, ex.kind, ex.list_scope);
      searches += out.searches;
      if (out.searches || out.cached) cardsSearched++;
      const f = out.fill;
      if (!f) continue;
      const urls: Record<string, string> = { ...it.source_urls };
      for (const k of ["address", "ingredients", "steps"] as const) {
        if (f[k] && !it[k]?.length && !(k === "address" && it.address)) {
          (it as unknown as Record<string, unknown>)[k] = f[k];
          it.sources = { ...it.sources, [k]: "search" };
          urls[k] = f.sourceUrl;
        }
      }
      if (Object.keys(urls).length) it.source_urls = urls;
    } catch { /* search is best-effort */ }
  }
  d.event?.("search", true, Date.now() - t2, { searches, cards: cardsSearched });
  d.log?.(`web_search count=${searches} cards=${cardsSearched}/${ex.items.length}`);
  return {
    ok: true,
    extraction: ex,
    raw_content: {
      platform: content.platform,
      caption: content.caption ?? null,
      transcript: content.transcript ?? null,
      ocr: content.ocr ?? null,
      linked_sites: linked.map((l) => l.url),
      item_source_urls: Object.fromEntries(ex.items.filter((i) => i.source_urls).map((i) => [i.name, i.source_urls])),
      item_sources: Object.fromEntries(ex.items.map((i) => [i.name, i.sources ?? {}])),
      recipe_details: Object.fromEntries(
        ex.items.filter((i) => i.ingredients || i.steps).map((i) => [i.name, { ingredients: i.ingredients ?? [], steps: i.steps ?? [] }]),
      ),
    },
  };
}
