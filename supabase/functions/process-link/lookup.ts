/** Place lookups sit behind this interface. Google Places is used only when GOOGLE_PLACES_API_KEY is set; otherwise the no-op stub. Web search is not approved and stays stubbed. */
export interface PlaceResult {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  mapsUri?: string;
  placeId?: string;
}
export interface LookupProvider {
  name: string;
  /** Resolve a named place; `hint` is the list scope (e.g. city). */
  findPlace(name: string, hint: string | null): Promise<PlaceResult | null>;
  /** Coordinates for a full address already stated in the captured text. */
  geocode?(address: string): Promise<{ lat: number; lng: number } | null>;
}
export const stubLookup: LookupProvider = { name: "stub", findPlace: () => Promise.resolve(null) };

const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri";
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

/** The top hit must share a name with the query, otherwise leave the fields empty rather than attach a wrong place. */
export function namesMatch(query: string, found: string): boolean {
  const q = norm(query), f = norm(found);
  if (!q || !f) return false;
  if (q === f || f.includes(q) || q.includes(f)) return true;
  const qt = q.split(" ").filter((t) => t.length > 2);
  const ft = new Set(f.split(" "));
  return qt.length > 0 && qt.every((t) => ft.has(t));
}

export function googleLookup(apiKey: string, fetchFn: typeof fetch = fetch): LookupProvider {
  const get = async (url: string, init?: RequestInit) => {
    const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.json() : null; // never log url or headers: they carry the key
  };
  return {
    name: "google",
    async findPlace(name, hint) {
      const j = await get("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
        body: JSON.stringify({ textQuery: hint ? `${name} ${hint}` : name, pageSize: 1 }),
      });
      const p = j?.places?.[0];
      const display = p?.displayName?.text;
      if (!p || typeof display !== "string" || typeof p.formattedAddress !== "string") return null;
      if (!namesMatch(name, display)) return null;
      const { latitude: lat, longitude: lng } = p.location ?? {};
      return {
        name: display,
        ...(typeof p.id === "string" ? { placeId: p.id } : {}),
        address: p.formattedAddress,
        ...(typeof lat === "number" && typeof lng === "number" ? { lat, lng } : {}),
        ...(typeof p.googleMapsUri === "string" ? { mapsUri: p.googleMapsUri } : {}),
      };
    },
    async geocode(address) {
      const j = await get(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}`);
      const loc = j?.status === "OK" && j.results?.length === 1 ? j.results[0].geometry?.location : null;
      return typeof loc?.lat === "number" && typeof loc?.lng === "number" ? { lat: loc.lat, lng: loc.lng } : null;
    },
  };
}

/** Real provider when the secret exists, stub otherwise. */
export function lookupFromEnv(get: (k: string) => string | undefined, fetchFn?: typeof fetch): LookupProvider {
  const key = get("GOOGLE_PLACES_API_KEY");
  return key ? googleLookup(key, fetchFn) : stubLookup;
}

export interface PlaceCache {
  get(key: string): Promise<PlaceResult | null>;
  set(key: string, p: PlaceResult): Promise<void>;
}

/** Re-runs reuse a stored hit instead of calling Google again. Only hits are cached; cache errors never fail a lookup. */
export function cachedLookup(inner: LookupProvider, cache: PlaceCache): LookupProvider {
  return {
    ...inner,
    async findPlace(name, hint) {
      const key = norm(`${name} ${hint ?? ""}`);
      try { const hit = await cache.get(key); if (hit) return hit; } catch { /* fall through to a live call */ }
      const p = await inner.findPlace(name, hint);
      if (p) { try { await cache.set(key, p); } catch { /* best-effort */ } }
      return p;
    },
  };
}
