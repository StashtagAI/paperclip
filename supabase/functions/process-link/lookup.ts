/** Paid lookups (Places, web search) are NOT approved. They sit behind this interface; the default is a no-op stub. */
export interface PlaceResult {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
}
export interface LookupProvider {
  name: string;
  findPlace(name: string, hint: string | null): Promise<PlaceResult | null>;
}
export const stubLookup: LookupProvider = { name: "stub", findPlace: () => Promise.resolve(null) };
