import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { syncNudges } from '@/lib/nudge-service';

/** Keeps nudges fresh while signed in, and opens the screen a tapped nudge points to (HAN-43). */
export function useNudges() {
  useEffect(() => {
    const sync = () => syncNudges().catch(() => {});
    sync();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && sync());
    return () => sub.remove();
  }, []);

  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const url = response.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
    Notifications.clearLastNotificationResponse();
  }, [response]);
}
