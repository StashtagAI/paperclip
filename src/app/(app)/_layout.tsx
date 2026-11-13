import { router, Stack, usePathname } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';

import { useTheme } from '@/hooks/use-theme';

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
      <Stack.Screen name="kind/[kind]" options={{ title: '', headerLargeTitle: true }} />
      <Stack.Screen name="list/[listId]" options={{ title: '' }} />
      <Stack.Screen name="share" options={{ headerShown: false }} />
      <Stack.Screen name="capture/[linkId]" options={{ title: '' }} />
      <Stack.Screen name="card/[linkId]" options={{ title: '' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen
        name="feedback"
        options={{ title: 'Send feedback', presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.75, 1] }}
      />
      <Stack.Screen
        name="delete-account"
        options={{ title: 'Delete account', presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.6, 1] }}
      />
      <Stack.Screen
        name="stash"
        options={{ title: 'Stash a link', presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.7, 1] }}
      />
    </Stack>
  );
}
