import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { checkLink } from '@/lib/link-filter';

/**
 * Landing route for the share sheet (iOS share extension / Android share intent). The extension only hands over the
 * link (no OCR there: iOS caps extension memory); here it is saved and the capture screen opens.
 */
export default function ShareScreen() {
  const { hasShareIntent, shareIntent, resetShareIntent, isReady } = useShareIntentContext();
  const shared = shareIntent.webUrl ?? shareIntent.text ?? '';
  // TikTok shares "text + link"; checkLink takes the first URL token and applies the allowlist.
  const check = checkLink(shared);
  const failed = isReady && hasShareIntent && !check.ok;

  const url = check.ok ? check.url : null;
  // Navigate once: resetting the intent re-renders with hasShareIntent=false, which must not bounce us home.
  const handled = useRef(false);
  useEffect(() => {
    if (!isReady || handled.current) return;
    if (!hasShareIntent) {
      handled.current = true;
      router.replace('/');
    } else if (url) {
      handled.current = true;
      resetShareIntent();
      router.replace({ pathname: '/stash', params: { url } });
    }
  }, [isReady, hasShareIntent, url, resetShareIntent]);

  const goHome = () => {
    resetShareIntent();
    router.replace('/');
  };

  return (
    <Screen>
      {!failed ? (
        <ActivityIndicator />
      ) : (
        <>
          <ThemedText type="subtitle">That isn’t an Instagram or TikTok post</ThemedText>
          <ThemedText themeColor="textSecondary" numberOfLines={3}>
            {shared || 'Nothing was shared.'}
          </ThemedText>
          <Button title="Go home" onPress={goHome} />
        </>
      )}
    </Screen>
  );
}
