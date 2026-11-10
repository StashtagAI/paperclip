import { appleMapsUrl, destination, fitViewport, googleMapsUrl, hasCoords, project, TILE_SIZE } from '@/lib/geo';

const scottsdale = { name: 'Café Monarch', address: '6934 E 1st Ave, Scottsdale, AZ', lat: 33.4917, lng: -111.9302 };
const noCoords = { name: 'The Mission', address: null, lat: null, lng: null };

describe('project', () => {
  it('puts 0,0 at the centre of the world', () => {
    expect(project({ lat: 0, lng: 0 }, 0)).toEqual({ x: TILE_SIZE / 2, y: TILE_SIZE / 2 });
  });
});

describe('fitViewport', () => {
  it('returns null without pins or size', () => {
    expect(fitViewport([], 300, 200)).toBeNull();
    expect(fitViewport([{ id: 'a', ...scottsdale }], 0, 200)).toBeNull();
  });

  it('centres a single pin at the max zoom', () => {
    const v = fitViewport([{ id: 'a', ...scottsdale }], 300, 200)!;
    expect(v.zoom).toBe(15);
    expect(v.pins[0].left).toBeCloseTo(150);
    expect(v.pins[0].top).toBeCloseTo(100);
  });

  it('keeps every pin inside the padded view and covers the view with tiles', () => {
    const pins = [
      { id: 'a', lat: 36.1069, lng: -112.1129 }, // Grand Canyon
      { id: 'b', lat: 37.2982, lng: -113.0263 }, // Zion
      { id: 'c', lat: 34.8697, lng: -111.761 }, // Sedona
    ];
    const v = fitViewport(pins, 360, 220, 32)!;
    for (const p of v.pins) {
      expect(p.left).toBeGreaterThanOrEqual(32 - 0.5);
      expect(p.left).toBeLessThanOrEqual(360 - 32 + 0.5);
      expect(p.top).toBeGreaterThanOrEqual(32 - 0.5);
      expect(p.top).toBeLessThanOrEqual(220 - 32 + 0.5);
    }
    // One zoom closer would no longer fit.
    const tighter = pins.map((p) => project(p, v.zoom + 1));
    const spanX = Math.max(...tighter.map((p) => p.x)) - Math.min(...tighter.map((p) => p.x));
    const spanY = Math.max(...tighter.map((p) => p.y)) - Math.min(...tighter.map((p) => p.y));
    expect(spanX > 296 || spanY > 156).toBe(true);
    expect(Math.min(...v.tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.max(...v.tiles.map((t) => t.left + TILE_SIZE))).toBeGreaterThanOrEqual(360);
  });
});

describe('directions', () => {
  it('uses stored coordinates when present', () => {
    expect(hasCoords(scottsdale)).toBe(true);
    expect(destination(scottsdale)).toBe('33.4917,-111.9302');
    expect(appleMapsUrl(scottsdale)).toBe('https://maps.apple.com/?daddr=33.4917%2C-111.9302&q=Caf%C3%A9%20Monarch');
    expect(googleMapsUrl(scottsdale)).toBe('https://www.google.com/maps/dir/?api=1&destination=33.4917%2C-111.9302');
  });

  it('falls back to name + city without coordinates or an address', () => {
    expect(hasCoords(noCoords)).toBe(false);
    expect(destination(noCoords, 'Scottsdale')).toBe('The Mission, Scottsdale');
    expect(appleMapsUrl(noCoords, 'Scottsdale')).toBe('https://maps.apple.com/?daddr=The%20Mission%2C%20Scottsdale');
    expect(destination({ ...noCoords, address: '3815 N Brown Ave' }, 'Scottsdale')).toBe('The Mission, 3815 N Brown Ave');
  });
});
