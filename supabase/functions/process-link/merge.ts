// Merge rules for filing a new post into existing lists (HAN-7): names match case- and whitespace-insensitively, so a
// second "restaurants in denver" post lands in Restaurants > Denver and never re-adds a place that is already there.

export const nameKey = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** The existing row whose name matches `name`, if any. */
export function findByName<T extends { name: string }>(rows: readonly T[], name: string): T | undefined {
  const key = nameKey(name);
  return rows.find((r) => nameKey(r.name) === key);
}

/** Splits extracted items into ones to insert and names already in the list; also drops repeats within the batch. */
export function splitNew<T extends { name: string }>(items: readonly T[], existingNames: readonly string[]) {
  const seen = new Set(existingNames.map(nameKey));
  const fresh: T[] = [];
  const already: string[] = [];
  for (const it of items) {
    const key = nameKey(it.name);
    if (seen.has(key)) {
      if (existingNames.some((n) => nameKey(n) === key)) already.push(it.name);
      continue;
    }
    seen.add(key);
    fresh.push(it);
  }
  return { fresh, already };
}

// ---- cross-post duplicate merge (HAN-44) ----
// The same place is often recommended in several posts under slightly different names ("Sap Sua" / "Sắp Sửa",
// "The Corner Office" / "Corner Office Restaurant"). Matching is deliberately conservative: a wrong merge hides a
// recommendation, a missed one only shows a duplicate.
//   1. identical names (nameKey) always match: the table is unique on (list_id, name) anyway.
//   2. names equal once accents, punctuation, "&"/"and" and a leading "the" are ignored match, unless both have
//      coordinates that are far apart (a chain's two branches).
//   3. similar names (one contains the other's words, or a small edit distance) match only when something other than
//      the name agrees: coordinates within NEAR_METERS, or the same street address.

export const NEAR_METERS = 250;
const FAR_METERS = 1000;

const strip = (s: string) =>
  s.normalize("NFKD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/ß/g, "ss").toLowerCase();

/** Name with accents, punctuation, "&" and a leading "the" removed; words separated by single spaces. */
export function fuzzyKey(s: string): string {
  return strip(s).replace(/&/g, " and ").replace(/['’`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/^the /, "");
}

const words = (s: string) => fuzzyKey(s).split(" ").filter(Boolean);
// Words that say what kind of place it is rather than which one.
const GENERIC = new Set(["restaurant", "cafe", "bar", "grill", "kitchen", "bistro", "hotel", "and", "co", "company", "house", "shop", "bakery", "pizzeria", "ristorante"]);

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** True when the names look like the same place: the same words, one name's words inside the other's, or a typo apart. */
export function similarNames(a: string, b: string): boolean {
  const ka = fuzzyKey(a), kb = fuzzyKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // Compare on the words that name the place; "Corner Office" vs "Corner Office Restaurant".
  const wa = words(a).filter((w) => !GENERIC.has(w)), wb = words(b).filter((w) => !GENERIC.has(w));
  if (wa.length && wb.length) {
    const [small, big] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
    if (small.every((w) => big.includes(w))) return true;
  }
  const ca = ka.replace(/ /g, ""), cb = kb.replace(/ /g, "");
  const longest = Math.max(ca.length, cb.length);
  return longest >= 6 && editDistance(ca, cb) <= Math.floor(longest * 0.15);
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export interface Place {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}
const coords = (p: Place) => (p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null);
const addrKey = (a?: string | null) => (a ? fuzzyKey(a) : "");

/** Do these two describe the same place? See the rules above. */
export function samePlace(a: Place, b: Place): boolean {
  if (nameKey(a.name) === nameKey(b.name)) return true;
  if (!similarNames(a.name, b.name)) return false;
  const ca = coords(a), cb = coords(b);
  const d = ca && cb ? distanceMeters(ca, cb) : null;
  if (d != null && d > FAR_METERS) return false;
  if (fuzzyKey(a.name) === fuzzyKey(b.name)) return true;
  if (d != null) return d <= NEAR_METERS;
  const aa = addrKey(a.address);
  return !!aa && aa === addrKey(b.address);
}

/**
 * Files extracted items against what the list already holds. `fresh` are new places; `matched` pairs an item with
 * the existing row for the same place (a later post recommending it again); repeats inside one post are dropped.
 */
export function mergeItems<N extends Place, E extends Place>(items: readonly N[], existing: readonly E[]) {
  const fresh: N[] = [];
  const matched: { item: N; existing: E }[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const key = nameKey(it.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = existing.find((e) => nameKey(e.name) === key) ?? existing.find((e) => samePlace(it, e));
    if (hit) matched.push({ item: it, existing: hit });
    else fresh.push(it);
  }
  return { fresh, matched };
}
