import type { ItemRow } from '@/lib/types';

/** Web Mercator tile maths and directions links for the Eats/Travel list map (HAN-24). */

export const TILE_SIZE = 256;
const MAX_ZOOM = 14;
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
  /** `size` is the on-screen edge of a tile: TILE_SIZE at whole zooms, scaled between them. */
  tiles: { key: string; z: number; x: number; y: number; left: number; top: number; size: number }[];
  pins: (Pin & { left: number; top: number })[];
};

/** Where the map looks: the centre as a fraction of the world (0..1 each way, zoom-free) and a possibly fractional zoom. */
export type Camera = { x: number; y: number; zoom: number };

/** How far in and out the interactive map goes; OpenStreetMap's standard tiles stop at 19 (HAN-141). */
export const MIN_ZOOM = 1;
export const MAX_USER_ZOOM = 18;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The highest integer zoom (up to 14) that fits every pin inside `width` x `height` minus `padding`, centred on their bounds. */
export function fitCamera(pins: Pin[], width: number, height: number, padding = 32): Camera | null {
  if (!pins.length || width <= 0 || height <= 0) return null;
  const availW = Math.max(1, width - padding * 2);
  const availH = Math.max(1, height - padding * 2);
  let zoom = MAX_ZOOM;
  for (; zoom > 0; zoom--) {
    const pts = pins.map((p) => project(p, zoom));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) <= availW && Math.max(...ys) - Math.min(...ys) <= availH) break;
  }
  const pts = pins.map((p) => project(p, 0));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x: (Math.max(...xs) + Math.min(...xs)) / 2 / TILE_SIZE, y: (Math.max(...ys) + Math.min(...ys)) / 2 / TILE_SIZE, zoom };
}

/** Tiles covering a `width` x `height` view of `camera`, and each pin's position in that view. */
export function cameraViewport(camera: Camera, pins: Pin[], width: number, height: number): Viewport {
  const { zoom } = camera;
  const world = TILE_SIZE * 2 ** zoom;
  const origin = { x: camera.x * world - width / 2, y: camera.y * world - height / 2 };
  // Whole-zoom tiles, stretched to the fractional zoom between two of them (a pinch in progress).
  const z = Math.round(zoom);
  const size = TILE_SIZE * 2 ** (zoom - z);
  const n = 2 ** z;
  const tiles: Viewport['tiles'] = [];
  for (let ty = Math.floor(origin.y / size); ty * size < origin.y + height; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(origin.x / size); tx * size < origin.x + width; tx++) {
      const x = ((tx % n) + n) % n; // wrap across the antimeridian
      tiles.push({ key: `${z}/${tx}/${ty}`, z, x, y: ty, left: tx * size - origin.x, top: ty * size - origin.y, size });
    }
  }
  return {
    zoom,
    origin,
    tiles,
    pins: pins.map((p) => {
      const pt = project(p, zoom);
      return { ...p, left: pt.x - origin.x, top: pt.y - origin.y };
    }),
  };
}

/** The view fitted to every pin (the static map before anyone pans or zooms it). */
export function fitViewport(pins: Pin[], width: number, height: number, padding = 32): Viewport | null {
  const camera = fitCamera(pins, width, height, padding);
  return camera ? cameraViewport(camera, pins, width, height) : null;
}

/** Drags the map by `dx`, `dy` screen points: the world moves with the finger. */
export function panCamera(camera: Camera, dx: number, dy: number): Camera {
  const world = TILE_SIZE * 2 ** camera.zoom;
  const x = camera.x - dx / world;
  return { ...camera, x: x - Math.floor(x), y: clamp(camera.y - dy / world, 0, 1) };
}

/**
 * Zooms to `zoom` keeping the world point under (`fx`, `fy`) in a `width` x `height` view where it is, the way a pinch
 * or double tap feels. Without a focal point it zooms about the centre.
 */
export function zoomCamera(camera: Camera, zoom: number, width: number, height: number, fx = width / 2, fy = height / 2): Camera {
  const next = clamp(zoom, MIN_ZOOM, MAX_USER_ZOOM);
  const before = TILE_SIZE * 2 ** camera.zoom;
  const after = TILE_SIZE * 2 ** next;
  const ox = fx - width / 2, oy = fy - height / 2;
  const x = camera.x + ox / before - ox / after;
  return { x: x - Math.floor(x), y: clamp(camera.y + oy / before - oy / after, 0, 1), zoom: next };
}

/** Centres the camera on `p`, keeping its zoom. */
export function centreOn(camera: Camera, p: LatLng): Camera {
  const pt = project(p, 0);
  return { ...camera, x: pt.x / TILE_SIZE, y: pt.y / TILE_SIZE };
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
