import {
  ANCHOR_REGION_ID,
  canNudge,
  clusterPlaces,
  digestMessage,
  distanceM,
  emptyHistory,
  MAX_REGIONS,
  nameList,
  nearbyMessage,
  nextDigestDates,
  planRegions,
  recordNudge,
  type NudgePlace,
} from '@/lib/nudges';

const place = (id: string, lat: number, lng: number, listId = 'l1', listName = 'Cafés'): NudgePlace => ({
  id,
  name: `Place ${id}`,
  lat,
  lng,
  listId,
  listName,
  kind: 'eats',
});

// ~0.0009° latitude ≈ 100 m.
const MISSION = { lat: 37.7599, lng: -122.4148 };

describe('distanceM', () => {
  it('measures roughly 111 km per degree of latitude', () => {
    expect(distanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
  });
});

describe('clusterPlaces', () => {
  it('groups places within 250 m and keeps far ones apart', () => {
    const clusters = clusterPlaces([
      place('a', MISSION.lat, MISSION.lng),
      place('b', MISSION.lat + 0.0009, MISSION.lng),
      place('c', MISSION.lat + 0.05, MISSION.lng),
    ]);
    expect(clusters.map((c) => c.places.map((p) => p.id))).toEqual([['a', 'b'], ['c']]);
    expect(clusters[0].radius).toBeGreaterThanOrEqual(200);
    expect(clusters[0].radius).toBeLessThanOrEqual(500);
  });

  it('is stable regardless of input order', () => {
    const ps = [place('b', MISSION.lat + 0.0009, MISSION.lng), place('a', MISSION.lat, MISSION.lng)];
    expect(clusterPlaces(ps)[0].id).toBe('a');
    expect(clusterPlaces([...ps].reverse())[0].id).toBe('a');
  });
});

describe('planRegions', () => {
  const many = Array.from({ length: 30 }, (_, i) => place(`p${String(i).padStart(2, '0')}`, MISSION.lat + i * 0.01, MISSION.lng));
  const clusters = clusterPlaces(many);

  it('watches every cluster when they fit', () => {
    const regions = planRegions(clusters.slice(0, 5), MISSION);
    expect(regions).toHaveLength(5);
    expect(regions.some((r) => r.identifier === ANCHOR_REGION_ID)).toBe(false);
  });

  it('watches the nearest clusters plus an anchor when there are too many', () => {
    const here = { lat: MISSION.lat + 0.29, lng: MISSION.lng }; // next to p29
    const regions = planRegions(clusters, here);
    expect(regions).toHaveLength(MAX_REGIONS);
    expect(regions[0].identifier).toBe('p29');
    const anchor = regions.at(-1)!;
    expect(anchor).toMatchObject({ identifier: ANCHOR_REGION_ID, notifyOnExit: true, notifyOnEnter: false });
    const farthest = Math.max(...regions.slice(0, -1).map((r) => distanceM(here, { lat: r.latitude, lng: r.longitude })));
    expect(anchor.radius).toBeGreaterThanOrEqual(Math.round(farthest) - 1);
  });

  it('caps at the OS limit without a location', () => {
    expect(planRegions(clusters, null)).toHaveLength(MAX_REGIONS);
  });
});

describe('rate limits', () => {
  const noon = new Date(2026, 10, 13, 12, 0);

  it('stays quiet overnight', () => {
    expect(canNudge(emptyHistory(), 'a', new Date(2026, 10, 13, 22, 0))).toBe(false);
    expect(canNudge(emptyHistory(), 'a', new Date(2026, 10, 13, 7, 59))).toBe(false);
    expect(canNudge(emptyHistory(), 'a', noon)).toBe(true);
  });

  it('waits a week before nudging about the same cluster', () => {
    const h = recordNudge(emptyHistory(), 'a', noon);
    expect(canNudge(h, 'a', new Date(noon.getTime() + 6 * 864e5))).toBe(false);
    expect(canNudge(h, 'a', new Date(noon.getTime() + 7 * 864e5))).toBe(true);
  });

  it('sends at most two a day', () => {
    let h = recordNudge(emptyHistory(), 'a', noon);
    h = recordNudge(h, 'b', new Date(noon.getTime() + 60_000));
    expect(canNudge(h, 'c', new Date(noon.getTime() + 120_000))).toBe(false);
    expect(canNudge(h, 'c', new Date(noon.getTime() + 864e5 + 120_000))).toBe(true);
  });

  it('suppressed clusters do not use up the daily cap', () => {
    const h = recordNudge(emptyHistory(), 'a', noon, false);
    expect(canNudge(h, 'a', noon)).toBe(false);
    expect(canNudge(h, 'b', noon)).toBe(true);
  });
});

describe('messages', () => {
  it('lists names readably', () => {
    expect(nameList(['A'])).toBe('A');
    expect(nameList(['A', 'B'])).toBe('A and B');
    expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
    expect(nameList(['A', 'B', 'C', 'D'])).toBe('A, B and 2 more');
  });

  it('nudges about one place', () => {
    const [c] = clusterPlaces([place('a', MISSION.lat, MISSION.lng)]);
    expect(nearbyMessage(c)).toEqual({
      title: 'Place a is near here',
      body: 'You saved it to Cafés. Tap to see it.',
      url: '/list/l1',
    });
  });

  it('nudges about several places and opens the list most of them are in', () => {
    const [c] = clusterPlaces([
      place('a', MISSION.lat, MISSION.lng, 'l1', 'Cafés'),
      place('b', MISSION.lat, MISSION.lng + 0.001, 'l2', 'Bakeries'),
      place('c', MISSION.lat + 0.001, MISSION.lng, 'l2', 'Bakeries'),
    ]);
    expect(nearbyMessage(c)).toEqual({
      title: 'You saved 3 places near here',
      body: 'Place a, Place b and Place c.',
      url: '/list/l2',
    });
  });
});

describe('weekly digest', () => {
  it('schedules the next Sundays at 10:00', () => {
    const thu = new Date(2026, 10, 12, 9, 0);
    const [first, second] = nextDigestDates(thu, 2);
    expect(first).toEqual(new Date(2026, 10, 15, 10, 0));
    expect(second).toEqual(new Date(2026, 10, 22, 10, 0));
    expect(nextDigestDates(new Date(2026, 10, 15, 10, 0), 1)[0]).toEqual(new Date(2026, 10, 22, 10, 0));
    expect(nextDigestDates(new Date(2026, 10, 15, 9, 59), 1)[0]).toEqual(new Date(2026, 10, 15, 10, 0));
  });

  const at = new Date(2026, 10, 15, 10, 0);
  const pick = (id: string, daysAgo: number) => ({
    id,
    name: `Item ${id}`,
    listId: `list-${id}`,
    listName: `List ${id}`,
    createdAt: new Date(at.getTime() - daysAgo * 864e5).toISOString(),
  });

  it('counts this week’s saves and suggests an older one', () => {
    const msg = digestMessage({ total: 3, picks: [pick('new', 2), pick('old1', 20), pick('old2', 30)] }, at, 1);
    expect(msg).toEqual({
      title: 'Your stash this week',
      body: 'You saved 1 new thing this week. Why not try Item old2 from List old2?',
      url: '/list/list-old2',
    });
  });

  it('says what is waiting when nothing is new', () => {
    const msg = digestMessage({ total: 1, picks: [pick('old', 20)] }, at, 0);
    expect(msg?.body).toBe('1 thing is waiting in your stash. Why not try Item old from List old?');
  });

  it('skips an empty stash', () => {
    expect(digestMessage({ total: 0, picks: [] }, at, 0)).toBeNull();
  });
});
