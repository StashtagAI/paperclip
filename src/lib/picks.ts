import type { StashItem } from '@/lib/data';
import { hasCoords, type LatLng } from '@/lib/geo';
import type { ItemRow } from '@/lib/types';

/**
 * "Living home" picks (HAN-48): a few items from the user's own stash under Tonight, Near you and Try this week.
 * Everything here is pure so the choices are testable; Home supplies the clock and (opt-in) location.
 *
 * Picks are stable for a day (Tonight) or a week (Try this week) so Home doesn't reshuffle on every refresh, and
 * `round` steps to the next set when the user asks for others.
 */

export type PickItem = StashItem & Pick<ItemRow, 'lat' | 'lng' | 'address'>;

export type StashPick = { item: PickItem; reason: string };
/** One section's picks, and whether "show others" has anything else to show. */
export type Picks = { picks: StashPick[]; more: boolean };

export const PICKS_PER_SECTION = 3;
/** How far "Near you" looks. */
export const NEAR_KM = 5;

// Whole words; `\b` won't do because it treats "é" as a boundary character.
const words = (list: string) => new RegExp(`(^|[^\\p{L}])(${list})(?![\\p{L}])`, 'iu');
const EVENING = words('dinner|bars?|cocktails?|wine|beer|brewery|pub|izakaya|tapas|pizza|ramen|sushi|tacos?|bistro|restaurants?|steak|supper|date night|late night');
const MORNING = words('breakfast|brunch|cafés?|cafes?|coffee|bakery|bakeries|pastry|pastries|bagels?|donuts?|doughnuts?');
const OLD_SAVE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A 32-bit FNV-1a hash, used to order items deterministically per day/week. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Local calendar day, e.g. "2026-11-13". */
export function dayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** ISO week, e.g. "2026-W46", so Try this week turns over on Monday. */
export function weekKey(now: Date): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7)}`;
}

function shuffled<T extends { item: PickItem }>(list: T[], seed: string): T[] {
  return [...list].sort((a, b) => hash(seed + a.item.id) - hash(seed + b.item.id));
}

/** Window `round` of `list`, wrapping so "show others" always has something to show. */
function page<T extends { item: PickItem }>(list: T[], round: number, reason: (p: T) => string): Picks {
  const more = list.length > PICKS_PER_SECTION;
  const start = more ? (round * PICKS_PER_SECTION) % list.length : 0;
  const shown = more ? [...list, ...list].slice(start, start + PICKS_PER_SECTION) : list;
  return { picks: shown.map((p) => ({ item: p.item, reason: reason(p) })), more };
}

function text(item: PickItem): string {
  return [item.name, item.list.name, item.list.category.name, ...item.tags, ...item.list.tags].join(' ');
}

/** Dinner and drinks out, or a recipe to cook in. Morning-only places drop to the back after 3 pm. */
export function tonightPicks(items: PickItem[], now: Date, round = 0): Picks {
  const evening = now.getHours() >= 15;
  const scored = shuffled(
    items
      .filter((item) => item.list.category.kind === 'eats' || item.list.category.kind === 'recipes')
      .map((item) => {
        const t = text(item);
        const score = (EVENING.test(t) ? 2 : 0) - (evening && MORNING.test(t) && !EVENING.test(t) ? 3 : 0);
        return { item, score };
      }),
    dayKey(now),
  ).sort((a, b) => b.score - a.score);

  // Two places out, then a recipe, so a stash of mostly restaurants still offers something to cook (and vice versa).
  const eats = scored.filter((s) => s.item.list.category.kind === 'eats');
  const recipes = scored.filter((s) => s.item.list.category.kind === 'recipes');
  const mixed: typeof scored = [];
  while (eats.length || recipes.length) {
    const wantRecipe = mixed.length % 3 === 2;
    mixed.push((wantRecipe ? recipes.shift() ?? eats.shift() : eats.shift() ?? recipes.shift())!);
  }

  return page(mixed, round, ({ item }) =>
    item.list.category.kind === 'recipes' ? `Cook in · ${item.list.name}` : `Eat out · ${item.list.name}`,
  );
}

/** Great-circle distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "350 m away" / "1.2 km away", or feet and miles where the region uses them. */
export function formatDistance(km: number, imperial: boolean): string {
  if (imperial) {
    const miles = km / 1.609344;
    return miles < 0.1 ? `${Math.max(50, Math.round((miles * 5280) / 50) * 50)} ft away` : `${miles.toFixed(1)} mi away`;
  }
  return km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m away` : `${km.toFixed(1)} km away`;
}

/** Places with coordinates within NEAR_KM of `here`, nearest first. Recipes have no place, so they're skipped. */
export function nearPicks(items: PickItem[], here: LatLng, imperial: boolean, round = 0): Picks {
  const near = items
    .filter((item) => item.list.category.kind !== 'recipes' && hasCoords(item))
    .map((item) => ({ item, km: distanceKm(here, { lat: item.lat!, lng: item.lng! }) }))
    .filter((p) => p.km <= NEAR_KM)
    .sort((a, b) => a.km - b.km);
  return page(near, round, ({ item, km }) => `${formatDistance(km, imperial)} · ${item.list.name}`);
}

/** Whether any saved place has coordinates, i.e. whether asking for location could show anything. */
export function hasPlaces(items: PickItem[]): boolean {
  return items.some((item) => item.list.category.kind !== 'recipes' && hasCoords(item));
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago". */
export function savedAgo(createdAt: string, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / DAY_MS));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/** Things to do and places to go, with saves older than two weeks first: the ones most likely forgotten. */
export function weekPicks(items: PickItem[], now: Date, exclude: ReadonlySet<string> = new Set(), round = 0): Picks {
  const cutoff = now.getTime() - OLD_SAVE_DAYS * DAY_MS;
  const candidates = shuffled(
    items
      .filter((item) => (item.list.category.kind === 'do' || item.list.category.kind === 'trips') && !exclude.has(item.id))
      .map((item) => ({ item, old: new Date(item.created_at).getTime() < cutoff })),
    weekKey(now),
  ).sort((a, b) => Number(b.old) - Number(a.old));
  return page(candidates, round, ({ item }) => `Saved ${savedAgo(item.created_at, now)} · ${item.list.name}`);
}

/** Regions that give distances in miles. */
export function usesMiles(locale: string | undefined): boolean {
  const region = locale?.split(/[-_]/)[1]?.toUpperCase();
  return region === 'US' || region === 'GB' || region === 'LR' || region === 'MM';
}
