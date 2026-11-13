import { router, Stack, usePathname } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';

import { useTheme } from '@/hooks/use-theme';
import { KIND_LABELS, KINDS, type Kind } from '@/lib/types';

const kindLabel = (kind?: string) => ((KINDS as readonly string[]).includes(kind ?? '') ? KIND_LABELS[kind as Kind] : '');

export default function AppLayout() {
  const theme = useTheme();
  // Android delivers a share as an intent on whatever screen is open; iOS also arrives via +native-intent.
  const { hasShareIntent } = useShareIntentContext();
  const pathname = usePathname();
  useEffect(() => {
    if (hasShareIntent && pathname !== '/share') router.push('/share');
  }, [hasShareIntent, pathname]);
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: theme.tint,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.background },
        headerTitleStyle: { color: theme.text },
        headerLargeTitleStyle: { color: theme.text },
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Your stash' }} />
      {/* Title set here, not via <Stack.Screen> in the screen, so the large title exists from the first frame. */}
      <Stack.Screen
        name="kind/[kind]"
        options={({ route }) => ({ title: kindLabel((route.params as { kind?: string } | undefined)?.kind), headerLargeTitle: true })}
      />
      <Stack.Screen name="list/[listId]" options={{ title: '' }} />
      <Stack.Screen name="share" options={{ headerShown: false }} />
      <Stack.Screen name="capture/[linkId]" options={{ title: '' }} />
      <Stack.Screen name="card/[linkId]" options={{ title: '' }} />
      <Stack.Screen
        name="stash"
        options={{ title: 'Stash a link', presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.7, 1] }}
      />
    </Stack>
  );
}
