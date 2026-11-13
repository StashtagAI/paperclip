import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, use, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/lib/auth';

/**
 * Optional Face ID / biometric lock (HAN-49). Off by default and native only: a web page can't ask for Face ID.
 * The setting is per device. Signing in counts as unlocking, so the lock only applies to a session that was already
 * here when the app started or came back.
 */

const KEY = 'stashtag.appLock';

/**
 * Coming back sooner than this doesn't lock again, so a quick trip to Instagram, the photo picker or the mail app
 * doesn't ask for Face ID every time.
 */
export const LOCK_AFTER_MS = 60_000;

export const appLockSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export function shouldLockOnReturn(backgroundedAt: number | null, now: number): boolean {
  return backgroundedAt !== null && now - backgroundedAt >= LOCK_AFTER_MS;
}

type State = {
  enabled: boolean;
  /** True while the lock screen should cover the app. */
  locked: boolean;
  /** True while the app is not in the foreground and the lock is on, so the app switcher shows a cover. */
  covered: boolean;
  ready: boolean;
  setEnabled: (on: boolean) => void;
  unlock: () => Promise<UnlockResult>;
};

export type UnlockResult = { ok: true } | { ok: false; message: string | null };

const AppLockContext = createContext<State>({
  enabled: false,
  locked: false,
  covered: false,
  ready: true,
  setEnabled: () => {},
  unlock: async () => ({ ok: true }),
});

export function AppLockProvider({ children }: PropsWithChildren) {
  const { session, loading: authLoading } = useAuth();
  const [enabled, setEnabledState] = useState(false);
  const [ready, setReady] = useState(!appLockSupported);
  // Starts locked: if the saved setting is on and a session was restored, the first frame is the lock screen.
  const [lockedState, setLocked] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!appLockSupported) return;
    AsyncStorage.getItem(KEY)
      .then((v) => setEnabledState(v === 'on'))
      .finally(() => setReady(true));
  }, []);

  // No session (signed out, or the app started signed out): nothing to lock, and the next sign-in starts unlocked.
  // Adjusted during render rather than in an effect, so there's no extra pass with a stale lock.
  const signedOut = !authLoading && !session;
  const [wasSignedOut, setWasSignedOut] = useState(signedOut);
  if (signedOut !== wasSignedOut) {
    setWasSignedOut(signedOut);
    if (signedOut) setLocked(false);
  }

  useEffect(() => {
    if (!appLockSupported) return;
    const sub = AppState.addEventListener('change', (next) => {
      setActive(next === 'active');
      // iOS goes 'inactive' while the Face ID sheet is up, so only a real trip to the background counts.
      if (next === 'background') backgroundedAt.current ??= Date.now();
      if (next === 'active') {
        if (shouldLockOnReturn(backgroundedAt.current, Date.now())) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  const setEnabled = (on: boolean) => {
    setEnabledState(on);
    // Turning it on happens right after a successful Face ID check, so the app stays unlocked.
    setLocked(false);
    (on ? AsyncStorage.setItem(KEY, 'on') : AsyncStorage.removeItem(KEY)).catch(() => {});
  };

  const unlock = async (): Promise<UnlockResult> => {
    const result = await authenticate('Unlock Stashtag');
    if (result.ok) setLocked(false);
    return result;
  };

  const on = appLockSupported && enabled && !!session;
  return (
    <AppLockContext
      value={{ enabled, locked: on && lockedState, covered: on && !active, ready, setEnabled, unlock }}>
      {children}
    </AppLockContext>
  );
}

export function useAppLock() {
  return use(AppLockContext);
}

/** "Face ID", "Touch ID" or the Android wording, for labels. */
export async function biometricName(): Promise<string> {
  if (Platform.OS !== 'ios') return 'Biometric unlock';
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => [] as LocalAuthentication.AuthenticationType[]);
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Touch ID';
  return 'Passcode';
}

/**
 * Asks for Face ID / fingerprint, falling back to the device passcode so a failed scan never locks anyone out.
 * `message` is null when the user cancelled, which needs no error.
 */
export async function authenticate(promptMessage: string): Promise<UnlockResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel' });
    if (result.success) return { ok: true };
    return { ok: false, message: errorMessage(result.error) };
  } catch {
    return { ok: false, message: 'Couldn’t check Face ID. Try again.' };
  }
}

function errorMessage(error: LocalAuthentication.LocalAuthenticationError): string | null {
  switch (error) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
      return null;
    case 'not_enrolled':
    case 'passcode_not_set':
    case 'not_available':
      return 'Set up Face ID, a fingerprint or a passcode in your phone’s settings first.';
    case 'lockout':
      return 'Too many tries. Unlock your phone with its passcode, then try again.';
    default:
      return 'That didn’t work. Try again.';
  }
}
