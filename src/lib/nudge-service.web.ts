import type { EnableResult, NudgeSettings } from './nudge-service';

/** Web can't geofence or schedule notifications while closed: nudges are iOS and Android only (HAN-43). */

export const nudgesSupported = false;

const off: NudgeSettings = { nearby: false, digest: false };

export const getNudgeSettings = async () => off;
export const getNudgeStatus = async () => ({ ...off, notificationsAllowed: false, backgroundLocationAllowed: false });
export const enableNearby = async (): Promise<EnableResult> => 'notifications-denied';
export const enableDigest = async (): Promise<EnableResult> => 'notifications-denied';
export const disableNearby = async () => {};
export const disableDigest = async () => {};
export const syncNudges = async (_options?: { force?: boolean }) => {};
