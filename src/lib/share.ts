import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

/**
 * Link to a shared list (HAN-50): the app's scheme, so it opens only where Stashtag is installed. The web app that
 * used to open these for friends without the app is retired (HAN-103).
 */
export function shareUrl(token: string): string {
  return Linking.createURL(`s/${token}`);
}

/**
 * The text sent through the share sheet: the list's name and the link, nothing from the list itself (HAN-68).
 * The message gets forwarded, so the items stay behind the link, which opens only for the people the owner added.
 */
export function shareMessage(category: string, list: string, url: string): string {
  return `${category} › ${list} on Stashtag: ${url}`;
}

/**
 * Opens the system share sheet. Browsers without the Web Share API get the text copied instead.
 * Resolves to what happened so the caller can announce it.
 */
export async function openShareSheet(message: string, title: string): Promise<'shared' | 'copied' | 'dismissed'> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.share) {
    await Clipboard.setStringAsync(message);
    return 'copied';
  }
  try {
    const result = await Share.share({ message, title });
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch (e) {
    // Web: closing the browser's share sheet rejects with AbortError.
    if ((e as Error).name === 'AbortError') return 'dismissed';
    throw e;
  }
}

const PENDING_KEY = 'stashtag.pendingShare';

/** Remembers a shared list someone wanted to add before signing in, so the app can reopen it afterwards. */
export const pendingShare = {
  set: (token: string) => AsyncStorage.setItem(PENDING_KEY, token),
  /** Returns the saved token once, clearing it. */
  async take(): Promise<string | null> {
    const token = await AsyncStorage.getItem(PENDING_KEY);
    if (token) await AsyncStorage.removeItem(PENDING_KEY);
    return token;
  },
};
