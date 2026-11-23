import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { oauthRedirectParams, type SocialProvider } from '@/lib/sign-in-providers';
import { supabase } from '@/lib/supabase';

/**
 * Google, Apple and Facebook sign-in through Supabase Auth (HAN-112).
 * - iOS + Apple: the native sheet (expo-apple-authentication), then signInWithIdToken with a hashed nonce.
 * - Other native: Supabase's OAuth page in an in-app browser session, which returns to stashtag://auth/callback with a
 *   PKCE code that is exchanged here.
 * - Web: a full-page redirect to the provider, back to /auth/callback, where supabase-js exchanges the code itself.
 * The same calls with mode 'link' connect a provider to the signed-in account (Profile › Sign-in methods), which is how
 * someone who chose Apple's "Hide My Email" reaches their existing account.
 * Supabase links a provider to an existing account automatically when both emails are the same and verified.
 */
export type SocialMode = 'sign-in' | 'link';
export type SocialResult = 'done' | 'cancelled' | 'redirecting';

/** Native: only an iPhone offers the Apple sheet. Android and web use Apple's web sign-in. */
export const nativeApple = Platform.OS === 'ios';

// On native, set while an in-app browser sign-in is open. Android also hands the redirect to the router, which opens
// /auth/callback; that screen reads this to leave the code to us instead of exchanging it a second time.
let inAppFlow: SocialMode | null = null;
export const inAppSocialFlow = () => inAppFlow;

// Web leaves the page for Apple's, so whether the session that comes back is from Apple is kept in storage.
const PENDING_APPLE = 'stashtag.pendingAppleOAuth';

export async function continueWith(provider: SocialProvider, mode: SocialMode = 'sign-in'): Promise<SocialResult> {
  if (provider === 'apple' && nativeApple) return appleNative(mode);
  return Platform.OS === 'web' ? webRedirect(provider, mode) : inAppBrowser(provider, mode);
}

async function appleNative(mode: SocialMode): Promise<SocialResult> {
  // Apple signs the SHA-256 of the nonce into the ID token; Supabase checks it against the raw value.
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    // Email only: we don't ask Apple for the user's name (they can add one in Profile).
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw e;
  }
  if (!credential.identityToken) throw new Error('Apple didn’t send a sign-in token');
  const token = { provider: 'apple' as const, token: credential.identityToken, nonce };
  const { error } = mode === 'link' ? await supabase.auth.linkIdentity(token) : await supabase.auth.signInWithIdToken(token);
  if (error) throw error;
  if (credential.authorizationCode) saveAppleToken({ authorizationCode: credential.authorizationCode });
  return 'done';
}

async function inAppBrowser(provider: SocialProvider, mode: SocialMode): Promise<SocialResult> {
  const redirectTo = Linking.createURL('auth/callback');
  const options = { redirectTo, skipBrowserRedirect: true };
  const { data, error } =
    mode === 'link'
      ? await supabase.auth.linkIdentity({ provider, options })
      : await supabase.auth.signInWithOAuth({ provider, options });
  if (error) throw error;
  if (!data.url) throw new Error('No sign-in page to open');

  inAppFlow = mode;
  try {
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return 'cancelled';
    const { code, error: redirectError } = oauthRedirectParams(result.url);
    if (redirectError) throw new Error(redirectError);
    if (!code) throw new Error('The sign-in page didn’t finish');
    const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    if (provider === 'apple') saveAppleRefreshToken(exchanged.session);
    return 'done';
  } finally {
    inAppFlow = null;
  }
}

async function webRedirect(provider: SocialProvider, mode: SocialMode): Promise<SocialResult> {
  const options = { redirectTo: `${window.location.origin}/auth/callback` };
  if (provider === 'apple') await AsyncStorage.setItem(PENDING_APPLE, '1');
  const { error } =
    mode === 'link'
      ? await supabase.auth.linkIdentity({ provider, options })
      : await supabase.auth.signInWithOAuth({ provider, options });
  if (error) {
    await AsyncStorage.removeItem(PENDING_APPLE);
    throw error;
  }
  return 'redirecting';
}

/** Web: called on SIGNED_IN after the redirect back. Stores Apple's refresh token if this session came from Apple. */
export async function afterWebRedirect(session: Session | null) {
  if (Platform.OS !== 'web' || !session) return;
  if (!(await AsyncStorage.getItem(PENDING_APPLE).catch(() => null))) return;
  await AsyncStorage.removeItem(PENDING_APPLE).catch(() => {});
  saveAppleRefreshToken(session);
}

function saveAppleRefreshToken(session: Session | null) {
  if (session?.provider_refresh_token) saveAppleToken({ refreshToken: session.provider_refresh_token });
}

/**
 * Hands Apple's token to the apple-token function, so deleting the account can revoke it. Fire and forget: signing in
 * must not fail because of it, and the function answers 503 until the board sets the Apple secrets.
 */
function saveAppleToken(body: { authorizationCode: string } | { refreshToken: string }) {
  supabase.functions.invoke('apple-token', { body }).then(
    ({ error }) => error && console.warn('[apple-token]', error.message),
    (e) => console.warn('[apple-token]', e),
  );
}
