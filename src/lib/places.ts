import type { KindCategory, KindList } from '@/lib/data';

/** A list as shown under a place: the list plus the category it is filed in (e.g. Bakeries). */
export type PlaceList = KindList & { categoryName: string };
/** Every list in one kind that shares a place name, e.g. Winter Park > Bakeries, Coffee shops (HAN-76). */
export type PlaceGroup = { key: string; name: string; lists: PlaceList[] };

const US_STATES: Record<string, string> = {
  al: 'alabama',
  ak: 'alaska',
  az: 'arizona',
  ar: 'arkansas',
  ca: 'california',
  co: 'colorado',
  ct: 'connecticut',
  de: 'delaware',
  fl: 'florida',
  ga: 'georgia',
  hi: 'hawaii',
  id: 'idaho',
  il: 'illinois',
  in: 'indiana',
  ia: 'iowa',
  ks: 'kansas',
  ky: 'kentucky',
  la: 'louisiana',
  me: 'maine',
  md: 'maryland',
  ma: 'massachusetts',
  mi: 'michigan',
  mn: 'minnesota',
  ms: 'mississippi',
  mo: 'missouri',
  mt: 'montana',
  ne: 'nebraska',
  nv: 'nevada',
  nh: 'new hampshire',
  nj: 'new jersey',
  nm: 'new mexico',
  ny: 'new york',
  nc: 'north carolina',
  nd: 'north dakota',
  oh: 'ohio',
  ok: 'oklahoma',
  or: 'oregon',
  pa: 'pennsylvania',
  ri: 'rhode island',
  sc: 'south carolina',
  sd: 'south dakota',
  tn: 'tennessee',
  tx: 'texas',
  ut: 'utah',
  vt: 'vermont',
  va: 'virginia',
  wa: 'washington',
  wv: 'west virginia',
  wi: 'wisconsin',
  wy: 'wyoming',
  dc: 'district of columbia',
};
const STATE_WORDS = new Set([...Object.keys(US_STATES), ...Object.values(US_STATES), 'usa', 'us']);

/**
 * The place a list is named for, without a trailing US state: extraction names the same town "Winter Park, CO" in
 * one post and "Winter Park, Colorado" in another, and both belong under one heading. Anything else (a theme like
 * "Date night", or "Paris, France") is kept as written.
 */
export function placeName(listName: string): string {
  const parts = listName.split(',').map((p) => p.trim());
  while (parts.length > 1 && STATE_WORDS.has(parts[parts.length - 1].toLowerCase().replace(/\./g, ''))) parts.pop();
  return parts.join(', ').replace(/\s+/g, ' ') || listName.trim();
}

/** Pivot a kind's categories > lists into places > lists, A–Z by place then category. */
export function groupByPlace(categories: KindCategory[]): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>();
  for (const category of categories) {
    for (const list of category.lists) {
      const name = placeName(list.name);
      const key = name.toLocaleLowerCase();
      const group = groups.get(key) ?? { key, name, lists: [] };
      group.lists.push({ ...list, categoryName: category.name });
      groups.set(key, group);
    }
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  return [...groups.values()]
    .map((g) => ({
      ...g,
      lists: g.lists.sort((a, b) => byName(a.categoryName, b.categoryName) || byName(a.name, b.name)),
    }))
    .sort((a, b) => byName(a.name, b.name));
}
