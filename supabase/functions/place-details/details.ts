// HAN-83: Google rating and opening hours for one restaurant, from the Places API (New).
// Pure apart from the injected fetch, so test.ts can run it under node.
import { namesMatch } from "../process-link/lookup.ts";

export type Point = { day: number; hour: number; minute: number };
export type OpeningHours = { periods: { open: Point; close?: Point }[]; weekday: string[]; utc_offset_minutes: number | null };
export type PlaceDetails = { placeId: string; rating: number | null; ratingCount: number | null; hours: OpeningHours | null };

/** What we know about the item; `hint` is its list's name (usually the city), `placeId` once a lookup found it. */
export type ItemQuery = {
  name: string;
  address: string | null;
  hint: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
};

const FIELDS = ["id", "displayName", "rating", "userRatingCount", "regularOpeningHours", "utcOffsetMinutes"];
// Rating and hours are Enterprise fields. List prices checked 2026-11-17; estimates for the daily caps, not invoices.
export const PRICES = { search: 35 / 1000, details: 20 / 1000 } as const;

const point = (p: unknown): Point | null => {
  const o = p as Record<string, unknown> | null;
  if (!o || typeof o.day !== "number" || o.day < 0 || o.day > 6) return null;
  const hour = typeof o.hour === "number" ? o.hour : 0;
  const minute = typeof o.minute === "number" ? o.minute : 0;
  return hour >= 0 && hour <= 24 && minute >= 0 && minute < 60 ? { day: o.day, hour, minute } : null;
};

/** Keep only well-formed periods and day lines; anything else from Google is dropped rather than stored. */
export function parsePlace(p: Record<string, unknown>): PlaceDetails | null {
  if (typeof p.id !== "string") return null;
  const rating = typeof p.rating === "number" && p.rating >= 1 && p.rating <= 5 ? p.rating : null;
  const count = typeof p.userRatingCount === "number" && p.userRatingCount >= 0 ? Math.floor(p.userRatingCount) : null;
  const h = p.regularOpeningHours as { periods?: unknown[]; weekdayDescriptions?: unknown[] } | undefined;
  const periods = (h?.periods ?? []).flatMap((x) => {
    const open = point((x as { open?: unknown }).open);
    if (!open) return [];
    const close = point((x as { close?: unknown }).close);
    return [close ? { open, close } : { open }];
  }).slice(0, 28);
  // Google's day lines use narrow and thin spaces around times; plain spaces read the same and wrap predictably.
  const weekday = (h?.weekdayDescriptions ?? []).filter((d): d is string => typeof d === "string")
    .map((d) => d.replace(/[\u202f\u2009]/g, " ").slice(0, 120)).slice(0, 7);
  const offset = typeof p.utcOffsetMinutes === "number" && Math.abs(p.utcOffsetMinutes) <= 14 * 60 ? p.utcOffsetMinutes : null;
  const hours = periods.length || weekday.length ? { periods, weekday, utc_offset_minutes: offset } : null;
  return { placeId: p.id, rating, ratingCount: rating == null ? null : count, hours };
}

export type Fetched = { details: PlaceDetails | null; usd: number };

/**
 * By place id when a previous lookup found one (cheaper, and always the same place); otherwise a text search for the
 * name near the item's address (else its list's city) and coordinates, accepted only if the top hit shares the item's name.
 * Throws on network or API errors so the caller can try again later instead of recording a miss.
 */
export async function fetchDetails(q: ItemQuery, apiKey: string, fetchFn: typeof fetch = fetch): Promise<Fetched> {
  const call = async (url: string, init: RequestInit) => {
    const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(5000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`places ${res.status}`); // never log url or headers: they carry the key
    return await res.json();
  };
  if (q.placeId) {
    const j = await call(`https://places.googleapis.com/v1/places/${encodeURIComponent(q.placeId)}`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELDS.join(",") },
    });
    // A place id Google no longer knows: fall through to a search by name.
    if (j) return { details: parsePlace(j), usd: PRICES.details };
  }
  const near = q.lat != null && q.lng != null
    ? { locationBias: { circle: { center: { latitude: q.lat, longitude: q.lng }, radius: 2000 } } }
    : {};
  const j = await call("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELDS.map((f) => `places.${f}`).join(",") },
    body: JSON.stringify({ textQuery: [q.name, q.address ?? q.hint].filter(Boolean).join(" "), pageSize: 1, ...near }),
  });
  const p = j?.places?.[0];
  const display = p?.displayName?.text;
  const usd = PRICES.search + (q.placeId ? PRICES.details : 0);
  if (!p || typeof display !== "string" || !namesMatch(q.name, display)) return { details: null, usd };
  return { details: parsePlace(p), usd };
}
