import type { ItemRow } from '@/lib/types';

/** Web Mercator tile maths and directions links for the Eats/Trips list map (HAN-24). */

export const TILE_SIZE = 256;
const MAX_ZOOM = 15;
const MAX_LAT = 85.05112878;

export type LatLng = { lat: number; lng: number };
export type Pin = LatLng & { id: string };

export function hasCoords(item: Pick<ItemRow, 'lat' | 'lng'>): item is { lat: number; lng: number } {
  return typeof item.lat === 'number' && typeof item.lng === 'number' && Math.abs(item.lat) <= 90 && Math.abs(item.lng) <= 180;
}

/** World pixel coordinates at zoom `z` (the world is TILE_SIZE * 2^z pixels wide). */
export function project({ lat, lng }: LatLng, z: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** z;
  const s = Math.sin((Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

export type Viewport = {
  zoom: number;
  /** World pixel at the view's top-left corner. */
  origin: { x: number; y: number };
  tiles: { key: string; z: number; x: number; y: number; left: number; top: number }[];
  pins: (Pin & { left: number; top: number })[];
};

/** The highest integer zoom that fits every pin inside `width` x `height` minus `padding`, centred on their bounds. */
export function fitViewport(pins: Pin[], width: number, height: number, padding = 32): Viewport | null {
  if (!pins.length || width <= 0 || height <= 0) return null;
  const availW = Math.max(1, width - padding * 2);
  const availH = Math.max(1, height - padding * 2);
  let zoom = MAX_ZOOM;
  for (; zoom > 0; zoom--) {
    const pts = pins.map((p) => project(p, zoom));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) <= availW && Math.max(...ys) - Math.min(...ys) <= availH) break;
  }
  const pts = pins.map((p) => project(p, zoom));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const origin = { x: cx - width / 2, y: cy - height / 2 };

  const n = 2 ** zoom;
  const tiles: Viewport['tiles'] = [];
  for (let ty = Math.floor(origin.y / TILE_SIZE); ty * TILE_SIZE < origin.y + height; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(origin.x / TILE_SIZE); tx * TILE_SIZE < origin.x + width; tx++) {
      const x = ((tx % n) + n) % n; // wrap across the antimeridian
      tiles.push({ key: `${zoom}/${tx}/${ty}`, z: zoom, x, y: ty, left: tx * TILE_SIZE - origin.x, top: ty * TILE_SIZE - origin.y });
    }
  }
  return {
    zoom,
    origin,
    tiles,
    pins: pins.map((p, i) => ({ ...p, left: pts[i].x - origin.x, top: pts[i].y - origin.y })),
  };
}

export const tileUrl = ({ z, x, y }: { z: number; x: number; y: number }) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

type Place = Pick<ItemRow, 'name' | 'address' | 'lat' | 'lng'>;

/** Stored coordinates when there are any, otherwise "name, address" (or "name, city" from the list name). */
export function destination(item: Place, city?: string | null): string {
  if (hasCoords(item)) return `${item.lat},${item.lng}`;
  return [item.name, item.address ?? city].filter(Boolean).join(', ');
}

export function appleMapsUrl(item: Place, city?: string | null): string {
  const q = hasCoords(item) ? `&q=${encodeURIComponent(item.name)}` : '';
  return `https://maps.apple.com/?daddr=${encodeURIComponent(destination(item, city))}${q}`;
}

export function googleMapsUrl(item: Place, city?: string | null): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination(item, city))}`;
}
