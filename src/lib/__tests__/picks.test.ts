import {
  dayKey,
  distanceKm,
  formatDistance,
  hasPlaces,
  nearPicks,
  savedAgo,
  tonightPicks,
  usesMiles,
  weekKey,
  weekPicks,
  type PickItem,
} from '@/lib/picks';
import type { Kind } from '@/lib/types';

let n = 0;
function item(kind: Kind, name: string, extra: Omit<Partial<PickItem>, 'list'> & { list?: string } = {}): PickItem {
  const { list = 'Denver', ...rest } = extra;
  n += 1;
  return {
    id: `i${n}`,
    name,
    tags: [],
    created_at: '2026-11-01T12:00:00Z',
    lat: null,
    lng: null,
    address: null,
    list: { id: `l-${list}`, name: list, tags: [], category: { kind, name: kind } },
    link: null,
    ...rest,
  };
}

// Friday 13 Nov 2026, 7 pm local.
const evening = new Date(2026, 10, 13, 19, 0);
const denver = { lat: 39.7392, lng: -104.9903 };

describe('tonightPicks', () => {
  it('only picks eats and recipes, three at a time', () => {
    const items = [
      item('eats', 'Tavernetta'),
      item('eats', 'Sushi Den'),
      item('recipes', 'Miso salmon'),
      item('do', 'Red Rocks'),
      item('trips', 'Aspen'),
      item('eats', 'Hop Alley'),
    ];
    const picks = tonightPicks(items, evening).picks;
    expect(picks).toHaveLength(3);
    expect(picks.every((p) => ['eats', 'recipes'].includes(p.item.list.category.kind))).toBe(true);
  });

  it('puts the third slot to a recipe when there is one', () => {
    const items = [item('eats', 'A bar'), item('eats', 'B bistro'), item('eats', 'C pizza'), item('recipes', 'Soup')];
    const picks = tonightPicks(items, evening).picks;
    expect(picks[2].item.name).toBe('Soup');
    expect(picks[2].reason).toBe('Cook in · Denver');
    expect(picks[0].reason).toBe('Eat out · Denver');
  });

  it('sends breakfast spots to the back in the evening but not in the morning', () => {
    const items = [item('eats', 'Little Owl', { list: 'Café' }), item('eats', 'Dinner place'), item('eats', 'Noodles')];
    const late = tonightPicks(items, evening).picks.map((p) => p.item.name);
    expect(late[late.length - 1]).toBe('Little Owl');
    expect(late[0]).toBe('Dinner place');
    const morning = tonightPicks(items, new Date(2026, 10, 13, 9)).picks.map((p) => p.item.name);
    expect(morning[0]).toBe('Dinner place');
    expect(morning).toContain('Little Owl');
  });

  it('is stable within a day and pages with round', () => {
    const items = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((x) => item('eats', x));
    const first = tonightPicks(items, evening).picks.map((p) => p.item.id);
    expect(tonightPicks(items, new Date(2026, 10, 13, 21)).picks.map((p) => p.item.id)).toEqual(first);
    const second = tonightPicks(items, evening, 1).picks.map((p) => p.item.id);
    expect(second).toHaveLength(3);
    expect(second.some((id) => first.includes(id))).toBe(false);
  });

  it('returns what there is when the stash is small', () => {
    expect(tonightPicks([item('recipes', 'Soup')], evening)).toMatchObject({ more: false });
    expect(tonightPicks([item('recipes', 'Soup')], evening).picks).toHaveLength(1);
    expect(tonightPicks([], evening).picks).toEqual([]);
    expect(tonightPicks(['A', 'B', 'C', 'D'].map((x) => item('eats', x)), evening).more).toBe(true);
  });
});

describe('nearPicks', () => {
  const near = item('eats', 'Close', { lat: 39.7402, lng: -104.9903 }); // ~110 m
  const mid = item('do', 'Mid', { lat: 39.76, lng: -104.99 }); // ~2.3 km
  const far = item('trips', 'Boulder', { lat: 40.015, lng: -105.2705 }); // ~39 km
  const recipe = item('recipes', 'Soup', { lat: 39.7392, lng: -104.9903 });
  const noCoords = item('eats', 'Nowhere');

  it('keeps places within range, nearest first, and skips recipes and items without coordinates', () => {
    const picks = nearPicks([far, mid, recipe, noCoords, near], denver, false).picks;
    expect(picks.map((p) => p.item.name)).toEqual(['Close', 'Mid']);
    expect(picks[0].reason).toBe('100 m away · Denver');
    expect(picks[1].reason).toBe('2.3 km away · Denver');
  });

  it('uses miles where the region does', () => {
    expect(nearPicks([mid], denver, true).picks[0].reason).toBe('1.4 mi away · Denver');
  });

  it('knows whether location could help at all', () => {
    expect(hasPlaces([recipe, noCoords])).toBe(false);
    expect(hasPlaces([noCoords, far])).toBe(true);
  });
});

describe('weekPicks', () => {
  it('picks do and trips, older saves first, skipping excluded items', () => {
    const old = item('do', 'Old hike', { created_at: '2026-09-01T00:00:00Z' });
    const fresh1 = item('trips', 'New trip', { created_at: '2026-11-12T00:00:00Z' });
    const fresh2 = item('do', 'New class', { created_at: '2026-11-11T00:00:00Z' });
    const shown = item('do', 'Already near', { created_at: '2026-08-01T00:00:00Z' });
    const picks = weekPicks([fresh1, item('eats', 'Cafe'), fresh2, old, shown], evening, new Set([shown.id])).picks;
    expect(picks[0].item.name).toBe('Old hike');
    expect(picks[0].reason).toBe('Saved 2 months ago · Denver');
    expect(picks.map((p) => p.item.name).sort()).toEqual(['New class', 'New trip', 'Old hike']);
  });

  it('keeps the same picks all week', () => {
    const items = ['A', 'B', 'C', 'D', 'E', 'F'].map((x) => item('do', x));
    const monday = weekPicks(items, new Date(2026, 10, 9, 8)).picks.map((p) => p.item.id);
    expect(weekPicks(items, new Date(2026, 10, 15, 22)).picks.map((p) => p.item.id)).toEqual(monday);
  });
});

describe('helpers', () => {
  it('keys days and ISO weeks', () => {
    expect(dayKey(evening)).toBe('2026-11-13');
    expect(weekKey(new Date(2026, 10, 9))).toBe('2026-W46');
    expect(weekKey(new Date(2026, 10, 15))).toBe('2026-W46');
    expect(weekKey(new Date(2026, 10, 16))).toBe('2026-W47');
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-W53');
  });

  it('measures distance', () => {
    expect(distanceKm(denver, { lat: 40.015, lng: -105.2705 })).toBeCloseTo(39, 0);
  });

  it('formats distance', () => {
    expect(formatDistance(0.01, false)).toBe('50 m away');
    expect(formatDistance(0.74, false)).toBe('750 m away');
    expect(formatDistance(0.05, true)).toBe('150 ft away');
  });

  it('says how long ago something was saved', () => {
    expect(savedAgo('2026-11-13T10:00:00', evening)).toBe('today');
    expect(savedAgo('2026-11-12T10:00:00', evening)).toBe('yesterday');
    expect(savedAgo('2026-10-20T10:00:00', evening)).toBe('3 weeks ago');
    expect(savedAgo('2025-01-01T10:00:00', evening)).toBe('22 months ago');
  });

  it('knows which regions use miles', () => {
    expect(usesMiles('en-US')).toBe(true);
    expect(usesMiles('en_GB')).toBe(true);
    expect(usesMiles('de-DE')).toBe(false);
    expect(usesMiles('en')).toBe(false);
    expect(usesMiles(undefined)).toBe(false);
  });
});
