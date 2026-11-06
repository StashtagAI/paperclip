export const KINDS = ["eats", "trips", "recipes", "do"] as const;
export type Kind = typeof KINDS[number];

export interface Item {
  name: string;
  description: string;
  address?: string;
  lat?: number;
  lng?: number;
}
export interface Extraction {
  kind: Kind;
  category: string;
  list_scope: string | null;
  tags: string[];
  items: Item[];
}

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null;

/** Strict validation of model output. Drops invalid optional fields, rejects invalid required ones. */
export function validateExtraction(raw: unknown): Extraction {
  if (!raw || typeof raw !== "object") throw new Error("not an object");
  const o = raw as Record<string, unknown>;
  if (!KINDS.includes(o.kind as Kind)) throw new Error(`bad kind: ${o.kind}`);
  const category = str(o.category, 80);
  if (!category) throw new Error("missing category");
  const list_scope = o.list_scope == null ? null : str(o.list_scope, 120);
  const tags = Array.isArray(o.tags)
    ? [...new Set(o.tags.map((t) => str(t, 40)?.toLowerCase()).filter((t): t is string => !!t))].slice(0, 8)
    : [];
  if (!Array.isArray(o.items)) throw new Error("items not an array");
  const items: Item[] = [];
  for (const it of o.items.slice(0, 50)) {
    if (!it || typeof it !== "object") continue;
    const i = it as Record<string, unknown>;
    const name = str(i.name, 200);
    if (!name) continue;
    const item: Item = { name, description: str(i.description, 500) ?? "" };
    const address = str(i.address, 300);
    if (address) item.address = address;
    // lat/lng only valid as a pair within range; otherwise omit (never invent)
    if (
      typeof i.lat === "number" && typeof i.lng === "number" &&
      Math.abs(i.lat) <= 90 && Math.abs(i.lng) <= 180
    ) {
      item.lat = i.lat;
      item.lng = i.lng;
    }
    items.push(item);
  }
  return { kind: o.kind as Kind, category, list_scope, tags, items };
}
