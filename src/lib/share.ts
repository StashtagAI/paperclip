import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

import { KIND_LABELS, type SharedList } from '@/lib/types';

/**
 * Link to a shared list (HAN-50). The web app's own origin on web; on a phone, the deployed web app when
 * EXPO_PUBLIC_WEB_URL is set (opens for anyone), else the app's scheme (opens only where Stashtag is installed).
 */
export function shareUrl(token: string, webUrl = process.env.EXPO_PUBLIC_WEB_URL): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/s/${token}`;
  if (webUrl) return `${webUrl.replace(/\/+$/, '')}/s/${token}`;
  return Linking.createURL(`s/${token}`);
}

/** The text card sent through the share sheet: readable on its own, so it works for friends without the app. */
export function shareMessage(list: SharedList, url: string): string {
  const lines = [`${list.category} › ${list.list} (${KIND_LABELS[list.kind]}), from my Stashtag:`, ''];
  for (const item of list.items) {
    lines.push(`• ${item.name}${item.address ? `, ${item.address}` : ''}`);
    if (item.source_url) lines.push(`  ${item.source_url}`);
  }
  if (!list.items.length) lines.push('(No items yet.)');
  lines.push('', `See or add the list: ${url}`);
  return lines.join('\n');
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
