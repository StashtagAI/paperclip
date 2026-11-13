import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import type { LatLng } from '@/lib/geo';

export type Here =
  | { status: 'off' }
  /** Never asked: Home offers a "Use my location" button rather than prompting on launch. */
  | { status: 'ask' }
  | { status: 'locating' }
  | { status: 'ready'; at: LatLng }
  /** Refused; `canAskAgain` false means only Settings can turn it back on. */
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'error'; message: string };

/** A position from the last 10 minutes is close enough for "Near you" and avoids waiting on GPS. */
const MAX_AGE_MS = 10 * 60 * 1000;

async function locate(): Promise<LatLng> {
  const last = await Location.getLastKnownPositionAsync({ maxAge: MAX_AGE_MS }).catch(() => null);
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));
const failed = (e: unknown): Here => ({ status: 'error', message: asError(e).message });

/**
 * The phone's position for Home's "Near you" picks (HAN-48), only while Home is open and only once the user has
 * allowed it. The position stays on the phone: distances are worked out locally against the stash.
 * `enabled` is false when nothing in the stash has coordinates, so there's no reason to ask.
 */
export function useHere(enabled: boolean) {
  const [here, setHere] = useState<Here>({ status: 'off' });

  /** Turns a permission answer into a position; resolves to the new state so callers can announce it. */
  const settle = useCallback(async (perm: Location.LocationPermissionResponse | Error): Promise<Here> => {
    let next: Here;
    if (perm instanceof Error) next = failed(perm);
    else if (!perm.granted) {
      next = perm.status === 'undetermined' ? { status: 'ask' } : { status: 'denied', canAskAgain: perm.canAskAgain };
    } else {
      setHere((h) => (h.status === 'ready' ? h : { status: 'locating' }));
      next = await locate().then((at): Here => ({ status: 'ready', at }), failed);
    }
    setHere(next);
    return next;
  }, []);

  /** Asks (or just checks) permission, then finds the phone. */
  const check = useCallback(
    (ask: boolean) =>
      (ask ? Location.requestForegroundPermissionsAsync() : Location.getForegroundPermissionsAsync()).then(settle, (e) =>
        settle(asError(e)),
      ),
    [settle],
  );

  useEffect(() => {
    // Not `check(false)`: setting state from a promise callback keeps the effect lint rule happy.
    if (enabled) Location.getForegroundPermissionsAsync().then(settle, (e) => settle(asError(e)));
  }, [enabled, settle]);

  return {
    here: enabled ? here : ({ status: 'off' } as Here),
    /** Asks for permission if needed, then finds the phone. */
    request: useCallback(() => check(true), [check]),
    /** Re-reads the position if already allowed (pull to refresh). */
    refresh: useCallback(() => {
      if (enabled) check(false);
    }, [enabled, check]),
  };
}
