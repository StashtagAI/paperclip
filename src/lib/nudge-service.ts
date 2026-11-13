import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { fetchDigestStats, fetchNudgePlaces } from '@/lib/data';
import {
  ANCHOR_REGION_ID,
  canNudge,
  clusterPlaces,
  digestMessage,
  distanceM,
  emptyHistory,
  nearbyMessage,
  nextDigestDates,
  planRegions,
  recordNudge,
  type NudgeHistory,
  type NudgeMessage,
  type PlaceCluster,
} from '@/lib/nudges';
import { supabase } from '@/lib/supabase';

/**
 * Smart nudges on iOS and Android (HAN-43). Both are opt-in and per device:
 * - nearby: geofences around clusters of saved places; entering one sends a local notification.
 * - digest: a local notification every Sunday morning, rescheduled with fresh numbers whenever the app opens.
 * Nothing leaves the phone: saved places are cached in AsyncStorage so the background task works offline.
 * Import this file from the root layout so the geofencing task is defined before the app can be woken for it.
 */

export const nudgesSupported = true;

export type NudgeSettings = { nearby: boolean; digest: boolean };

/** What turning a nudge on ended up as; anything but 'on' leaves it off. */
export type EnableResult = 'on' | 'notifications-denied' | 'location-denied' | 'background-denied';

const GEOFENCE_TASK = 'stashtag-nearby-nudges';
const CHANNEL_ID = 'nudges';
const DIGEST_WEEKS = 4;
const SYNC_EVERY_MS = 15 * 60 * 1000;

const KEYS = {
  settings: 'nudges:settings',
  clusters: 'nudges:clusters',
  history: 'nudges:history',
} as const;

const digestId = (week: number) => `digest-${week}`;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const writeJson = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value));

export const getNudgeSettings = () => readJson<NudgeSettings>(KEYS.settings, { nearby: false, digest: false });

async function setSetting(patch: Partial<NudgeSettings>) {
  await writeJson(KEYS.settings, { ...(await getNudgeSettings()), ...patch });
}

// Show nudges as banners even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

async function notify(message: NudgeMessage, trigger: Notifications.NotificationTriggerInput, identifier?: string) {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title: message.title, body: message.body, data: { url: message.url } },
    trigger,
  });
}

/** A recent fix if there is one, else a fresh one; null after 15 s so a background wake can't hang on it. */
async function hereNow(): Promise<{ lat: number; lng: number } | null> {
  const fresh = () =>
    Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
    ]).catch(() => null);
  const pos = (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }).catch(() => null)) ?? (await fresh());
  return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
}

/** Watches the nearest clusters. Clusters you're already standing in count as nudged, so turning nudges on is quiet. */
async function watchClusters(clusters: PlaceCluster[], here: { lat: number; lng: number } | null) {
  const regions = planRegions(clusters, here);
  if (!regions.length) {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
    return;
  }
  if (here) {
    const now = new Date();
    let history = await readJson<NudgeHistory>(KEYS.history, emptyHistory());
    for (const c of clusters) if (distanceM(here, c) <= c.radius) history = recordNudge(history, c.id, now, false);
    await writeJson(KEYS.history, history);
  }
  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
}

type GeofenceData = { eventType: Location.GeofencingEventType; region: Location.LocationRegion };

TaskManager.defineTask<GeofenceData>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { eventType, region } = data;
  const clusters = await readJson<PlaceCluster[]>(KEYS.clusters, []);
  if (region.identifier === ANCHOR_REGION_ID) {
    // Moved away from the area being watched: watch the clusters nearest to where you are now.
    if (eventType === Location.GeofencingEventType.Exit) await watchClusters(clusters, await hereNow());
    return;
  }
  if (eventType !== Location.GeofencingEventType.Enter) return;
  const cluster = clusters.find((c) => c.id === region.identifier);
  if (!cluster || !(await getNudgeSettings()).nearby) return;
  const now = new Date();
  const history = await readJson<NudgeHistory>(KEYS.history, emptyHistory());
  if (!canNudge(history, cluster.id, now)) return;
  await writeJson(KEYS.history, recordNudge(history, cluster.id, now));
  await notify(nearbyMessage(cluster), Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null);
});

async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Nudges',
      description: 'Saved places near you and your weekly stash digest',
      importance: AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function syncNearby() {
  const places = await fetchNudgePlaces();
  const clusters = clusterPlaces(places);
  await writeJson(KEYS.clusters, clusters);
  await watchClusters(clusters, await hereNow());
}

async function syncDigest() {
  const stats = await fetchDigestStats();
  await cancelDigest();
  const dates = nextDigestDates(new Date(), DIGEST_WEEKS);
  for (const [week, date] of dates.entries()) {
    const message = digestMessage(stats, date, week);
    if (!message) continue;
    await notify(
      message,
      { type: Notifications.SchedulableTriggerInputTypes.DATE, date, ...(Platform.OS === 'android' && { channelId: CHANNEL_ID }) },
      digestId(week),
    );
  }
}

async function cancelDigest() {
  await Promise.all(
    Array.from({ length: DIGEST_WEEKS }, (_, w) => Notifications.cancelScheduledNotificationAsync(digestId(w)).catch(() => {})),
  );
}

async function stopNearby() {
  if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
  await AsyncStorage.multiRemove([KEYS.clusters, KEYS.history]);
}

export async function enableNearby(): Promise<EnableResult> {
  if (!(await ensureNotificationPermission())) return 'notifications-denied';
  if (!(await Location.requestForegroundPermissionsAsync()).granted) return 'location-denied';
  // Geofences fire while the app is closed, which needs "Always" (iOS) / "Allow all the time" (Android).
  if (!(await Location.requestBackgroundPermissionsAsync()).granted) return 'background-denied';
  await setSetting({ nearby: true });
  await syncNearby();
  return 'on';
}

export async function disableNearby() {
  await setSetting({ nearby: false });
  await stopNearby();
}

export async function enableDigest(): Promise<EnableResult> {
  if (!(await ensureNotificationPermission())) return 'notifications-denied';
  await setSetting({ digest: true });
  await syncDigest();
  return 'on';
}

export async function disableDigest() {
  await setSetting({ digest: false });
  await cancelDigest();
}

let lastSync = 0;

/**
 * Refreshes the cached places and the digest text. Runs when the app opens or comes back to the foreground, at most
 * every 15 minutes. If a permission was revoked in Settings, that nudge stays on but does nothing until it's back;
 * the Nudges screen says so.
 */
export async function syncNudges({ force = false } = {}) {
  if (!force && Date.now() - lastSync < SYNC_EVERY_MS) return;
  lastSync = Date.now();
  const settings = await getNudgeSettings();
  const notifications = (await Notifications.getPermissionsAsync()).granted;
  if (settings.nearby) {
    if (notifications && (await Location.getBackgroundPermissionsAsync()).granted) await syncNearby();
    else await stopNearby();
  }
  if (settings.digest && notifications) await syncDigest();
}

/** What the Nudges screen shows: each setting and whether the OS still lets it work. */
export async function getNudgeStatus(): Promise<NudgeSettings & { notificationsAllowed: boolean; backgroundLocationAllowed: boolean }> {
  const [settings, notifications, background] = await Promise.all([
    getNudgeSettings(),
    Notifications.getPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return { ...settings, notificationsAllowed: notifications.granted, backgroundLocationAllowed: background.granted };
}

/** Signing out turns nudges off and forgets the cached places. */
async function stopAllNudges() {
  lastSync = 0;
  await Promise.all([stopNearby(), cancelDigest()]);
  await AsyncStorage.removeItem(KEYS.settings);
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') stopAllNudges().catch(() => {});
});
