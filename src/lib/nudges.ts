import type { LatLng } from '@/lib/geo';
import type { Kind } from '@/lib/types';

/**
 * Smart nudges (HAN-43): pure planning for "saved places near here" geofences and the weekly digest. The native side
 * (permissions, geofencing, notifications) lives in nudge-service.ts.
 */

/** A saved item with coordinates, cached on the phone so the background task can work without the network. */
export type NudgePlace = LatLng & { id: string; name: string; listId: string; listName: string; kind: Kind };

/** Saved places close enough together to share one geofence. */
export type PlaceCluster = LatLng & { id: string; radius: number; places: NudgePlace[] };

/** Places this close to a cluster's first place join it. */
const CLUSTER_SPAN_M = 250;
/** Geofence radii: iOS region monitoring is unreliable below ~100-150 m. */
const MIN_RADIUS_M = 200;
const MAX_RADIUS_M = 500;
/** iOS monitors at most 20 regions per app; one is the "you moved away, re-pick" anchor. */
export const MAX_REGIONS = 20;
const MIN_ANCHOR_M = 1_000;

/** Don't repeat a nudge for the same cluster within a week, send at most 2 a day, and stay quiet overnight. */
export const CLUSTER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_NUDGES_PER_DAY = 2;
const QUIET_FROM_HOUR = 21;
const QUIET_UNTIL_HOUR = 8;

export const ANCHOR_REGION_ID = 'anchor';

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Greedy clustering: each unclaimed place (in id order, so the result is stable) starts a cluster and claims the
 * unclaimed places within CLUSTER_SPAN_M of it. The cluster id is its first place's id, so cooldowns survive a resync.
 */
export function clusterPlaces(places: NudgePlace[]): PlaceCluster[] {
  const sorted = [...places].sort((a, b) => a.id.localeCompare(b.id));
  const claimed = new Set<string>();
  const clusters: PlaceCluster[] = [];
  for (const seed of sorted) {
    if (claimed.has(seed.id)) continue;
    const members = sorted.filter((p) => !claimed.has(p.id) && distanceM(seed, p) <= CLUSTER_SPAN_M);
    members.forEach((p) => claimed.add(p.id));
    const center = {
      lat: members.reduce((s, p) => s + p.lat, 0) / members.length,
      lng: members.reduce((s, p) => s + p.lng, 0) / members.length,
    };
    const spread = Math.max(...members.map((p) => distanceM(center, p)));
    clusters.push({
      id: seed.id,
      ...center,
      radius: Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(spread + 100))),
      places: members,
    });
  }
  return clusters;
}

export type Region = { identifier: string; latitude: number; longitude: number; radius: number; notifyOnEnter: boolean; notifyOnExit: boolean };

/**
 * The clusters nearest `here`, as geofences. When there are more than the OS can watch, the last slot is an anchor
 * around `here` reaching to the farthest chosen cluster: leaving it means it's time to re-pick.
 */
export function planRegions(clusters: PlaceCluster[], here: LatLng | null): Region[] {
  const byDistance = here
    ? [...clusters].sort((a, b) => distanceM(here, a) - distanceM(here, b))
    : clusters;
  const needsAnchor = !!here && clusters.length > MAX_REGIONS;
  const chosen = byDistance.slice(0, needsAnchor ? MAX_REGIONS - 1 : MAX_REGIONS);
  const regions: Region[] = chosen.map((c) => ({
    identifier: c.id,
    latitude: c.lat,
    longitude: c.lng,
    radius: c.radius,
    notifyOnEnter: true,
    notifyOnExit: false,
  }));
  if (needsAnchor && here) {
    const reach = Math.max(MIN_ANCHOR_M, ...chosen.map((c) => distanceM(here, c)));
    regions.push({
      identifier: ANCHOR_REGION_ID,
      latitude: here.lat,
      longitude: here.lng,
      radius: Math.round(reach),
      notifyOnEnter: false,
      notifyOnExit: true,
    });
  }
  return regions;
}

/** When each cluster was last nudged (ms since epoch), plus recent send times for the daily cap. */
export type NudgeHistory = { byCluster: Record<string, number>; sent: number[] };

export const emptyHistory = (): NudgeHistory => ({ byCluster: {}, sent: [] });

export function isQuietHour(now: Date): boolean {
  const h = now.getHours();
  return h >= QUIET_FROM_HOUR || h < QUIET_UNTIL_HOUR;
}

export function canNudge(history: NudgeHistory, clusterId: string, now: Date): boolean {
  const t = now.getTime();
  if (isQuietHour(now)) return false;
  const last = history.byCluster[clusterId];
  if (last != null && t - last < CLUSTER_COOLDOWN_MS) return false;
  return history.sent.filter((s) => t - s < 24 * 60 * 60 * 1000).length < MAX_NUDGES_PER_DAY;
}

/** Records a nudge (or a suppressed one, e.g. a cluster you were already in when nudges started). */
export function recordNudge(history: NudgeHistory, clusterId: string, now: Date, counted = true): NudgeHistory {
  const t = now.getTime();
  return {
    byCluster: { ...history.byCluster, [clusterId]: t },
    sent: [...history.sent.filter((s) => t - s < 24 * 60 * 60 * 1000), ...(counted ? [t] : [])],
  };
}

/** "Tartine", "Tartine and Zuni" or "Tartine, Zuni and 2 more". */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export type NudgeMessage = { title: string; body: string; url: string };

/** "You saved 3 places near here" with their names; tapping opens the list most of them are in. */
export function nearbyMessage(cluster: PlaceCluster): NudgeMessage {
  const { places } = cluster;
  const n = places.length;
  const counts = new Map<string, number>();
  places.forEach((p) => counts.set(p.listId, (counts.get(p.listId) ?? 0) + 1));
  const top = places.find((p) => p.listId === [...counts].sort((a, b) => b[1] - a[1])[0][0])!;
  const sameList = counts.size === 1;
  return {
    title: n === 1 ? `${places[0].name} is near here` : `You saved ${n} places near here`,
    body:
      n === 1
        ? `You saved it to ${top.listName}. Tap to see it.`
        : `${nameList(places.map((p) => p.name))}${sameList ? `, from ${top.listName}` : ''}.`,
    url: `/list/${top.listId}`,
  };
}

/** A saved item the digest can suggest. */
export type DigestPick = { id: string; name: string; listId: string; listName: string; createdAt: string };

export type DigestStats = { total: number; picks: DigestPick[] };

/** Sunday 10:00 local, the digest's slot. */
export const DIGEST_WEEKDAY = 0;
export const DIGEST_HOUR = 10;

/** The next `count` digest times strictly after `now`. */
export function nextDigestDates(now: Date, count: number): Date[] {
  const first = new Date(now);
  first.setHours(DIGEST_HOUR, 0, 0, 0);
  first.setDate(first.getDate() + ((DIGEST_WEEKDAY - first.getDay() + 7) % 7));
  if (first <= now) first.setDate(first.getDate() + 7);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + 7 * i);
    return d;
  });
}

/**
 * Digest text for the slot at `at`. "New this week" counts saves in the 7 days before it, which is only known for
 * saves made before scheduling; later weeks are rescheduled whenever the app opens, so stale counts don't last.
 * Each week suggests a different older save.
 */
export function digestMessage(stats: DigestStats, at: Date, week: number): NudgeMessage | null {
  if (!stats.total) return null;
  const since = at.getTime() - 7 * 24 * 60 * 60 * 1000;
  const fresh = stats.picks.filter((p) => Date.parse(p.createdAt) > since).length;
  const older = stats.picks.filter((p) => Date.parse(p.createdAt) <= since);
  const pool = older.length ? older : stats.picks;
  const pick = pool.length ? pool[week % pool.length] : null;
  const saved = fresh
    ? `You saved ${fresh} new ${fresh === 1 ? 'thing' : 'things'} this week.`
    : `${stats.total} ${stats.total === 1 ? 'thing is' : 'things are'} waiting in your stash.`;
  return {
    title: 'Your stash this week',
    body: pick ? `${saved} Why not try ${pick.name} from ${pick.listName}?` : saved,
    url: pick ? `/list/${pick.listId}` : '/',
  };
}
