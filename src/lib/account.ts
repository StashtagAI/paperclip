import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export const SUPPORT_EMAIL = 'support@stashtag.ai';

export type FeedbackCategory = 'bug' | 'idea' | 'other';

export const appVersion = Constants.expoConfig?.version ?? 'unknown';
export const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';

/** Saves to `feedback` (HAN-34). RLS only allows inserting your own rows, and nothing can be read back. */
export async function submitFeedback(message: string, category: FeedbackCategory | null): Promise<void> {
  const { error } = await supabase
    .from('feedback')
    .insert({ message: message.trim(), category, app_version: appVersion, platform });
  if (error) throw error;
}

/** mailto: link with the subject and the version/platform pre-filled for support. */
export function supportMailto(): string {
  const body = `\n\n---\nApp version: ${appVersion}\nPlatform: ${platform} ${Platform.Version ?? ''}`.trimEnd();
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Stashtag support')}&body=${encodeURIComponent(body)}`;
}

/** Signs out on this device only. Supabase's default is every device, which is "Sign out everywhere" below. */
export async function signOutHere(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' });
}

/**
 * Revokes every session of this account (HAN-49), then signs out here. Other devices can't refresh any more and are
 * signed out when their current access token expires (within the hour). On a network error nothing is signed out
 * and the error is thrown, so the user can retry.
 */
export async function signOutEverywhere(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) throw error;
}

/**
 * Permanently deletes the account through the delete-account function (service role, server side only), then signs
 * out locally. The server session is already gone with the user, so a global sign-out would fail.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
  if (error) {
    const reply = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(reply?.error ?? error.message);
  }
  await supabase.auth.signOut({ scope: 'local' });
}
