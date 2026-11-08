import { buildContent } from "./retrieval.ts";
import { readLinkedSites } from "./linked.ts";
import { extract } from "./extract.ts";
import { type LookupProvider, stubLookup } from "./lookup.ts";
import type { Extraction } from "./schema.ts";

export interface Deps {
  apiKey: string;
  fetchFn?: typeof fetch;
  lookup?: LookupProvider;
}

export type Result =
  | { ok: true; extraction: Extraction; raw_content: Record<string, unknown> }
  | { ok: false; error: string };

/** url + captured text -> validated, grounded extraction. No DB access, no fetch of the social post. */
export async function processCaptured(url: string, captured: unknown, d: Deps): Promise<Result> {
  const content = buildContent(url, captured);
  if (!content) return { ok: false, error: "no_captured_text" };
  const text = [content.caption, content.transcript, content.ocr].filter(Boolean).join("\n");
  const linked = await readLinkedSites(text, d.fetchFn);
  const ex = await extract(content, linked, d.apiKey, d.fetchFn);
  if (!ex.items.length) return { ok: false, error: "no_items_found" };

  const lookup = d.lookup ?? stubLookup;
  for (const it of ex.items) {
    if (ex.kind === "recipes" || it.address) continue;
    try {
      const p = await lookup.findPlace(it.name, ex.list_scope);
      if (!p) continue;
      it.address = p.address;
      it.sources = { ...it.sources, address: "search" };
      if (p.lat != null && p.lng != null) { it.lat = p.lat; it.lng = p.lng; it.sources.lat = it.sources.lng = "search"; }
    } catch { /* lookup is best-effort */ }
  }
  return {
    ok: true,
    extraction: ex,
    raw_content: {
      platform: content.platform,
      caption: content.caption ?? null,
      transcript: content.transcript ?? null,
      ocr: content.ocr ?? null,
      linked_sites: linked.map((l) => l.url),
      item_sources: Object.fromEntries(ex.items.map((i) => [i.name, i.sources ?? {}])),
      recipe_details: Object.fromEntries(
        ex.items.filter((i) => i.ingredients || i.steps).map((i) => [i.name, { ingredients: i.ingredients ?? [], steps: i.steps ?? [] }]),
      ),
    },
  };
}
