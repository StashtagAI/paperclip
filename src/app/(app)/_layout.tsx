import { router, Stack, usePathname } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { HomeBackButton } from '@/components/home-back-button';
import { NewSharePrompt } from '@/components/new-share-prompt';
import { useNudges } from '@/hooks/use-nudges';
import { useTheme } from '@/hooks/use-theme';
import { pendingShare } from '@/lib/share';
import { resetSharedWithMe } from '@/lib/shared-with-me';
import { KIND_LABELS, KINDS, type Kind } from '@/lib/types';

// Home sits under every screen, even one opened straight from a link or a notification, so back always has somewhere
// to go (HAN-91).
export const unstable_settings = { anchor: 'index' };

const kindLabel = (kind?: string) => ((KINDS as readonly string[]).includes(kind ?? '') ? KIND_LABELS[kind as Kind] : '');

export default function AppLayout() {
  const theme = useTheme();
  // Android delivers a share as an intent on whatever screen is open; iOS also arrives via +native-intent.
  const { hasShareIntent } = useShareIntentContext();
  const pathname = usePathname();
  useEffect(() => {
    if (hasShareIntent && pathname !== '/share') router.push('/share');
  }, [hasShareIntent, pathname]);
  useNudges();
  // Someone opened a friend's shared list, tapped "Sign in to add it", and has now signed in: take them back to it.
  useEffect(() => {
    pendingShare.take().then((token) => {
      if (token) router.push({ pathname: '/s/[token]', params: { token } });
    });
  }, []);
  // Signing out unmounts this group; the next account mustn't see these shares.
  useEffect(() => resetSharedWithMe, []);
  return (
    <View style={styles.fill}>
      <Stack
        screenOptions={({ navigation }) => ({
          // Every screen but Home and Profile has a back button: if nothing is under it, it goes Home (HAN-91).
          headerLeft: navigation.canGoBack() ? undefined : () => <HomeBackButton />,
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: theme.tint,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.background },
          headerTitleStyle: { color: theme.text },
          headerLargeTitleStyle: { color: theme.text },
          contentStyle: { backgroundColor: theme.background },
        })}>
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Your stash' }} />
        {/* Title set here, not via <Stack.Screen> in the screen, so the large title exists from the first frame.
            No header background: on iOS 26 a background color with a large title hides the title after going back (HAN-31). */}
        <Stack.Screen
          name="kind/[kind]"
          options={({ route }) => ({
            title: kindLabel((route.params as { kind?: string } | undefined)?.kind),
            headerLargeTitle: true,
            headerStyle: {},
          })}
        />
        <Stack.Screen name="list/[listId]" options={{ title: '' }} />
        <Stack.Screen name="shared-list/[listId]" options={{ title: '' }} />
        <Stack.Screen name="add-items/[listId]" options={{ title: '' }} />
        <Stack.Screen name="share" options={{ headerShown: false }} />
        <Stack.Screen name="capture/[linkId]" options={{ title: '' }} />
        <Stack.Screen name="card/[linkId]" options={{ title: '' }} />
        <Stack.Screen name="item/[itemId]" options={{ title: '' }} />
        <Stack.Screen name="recipe/[itemId]" options={{ title: '' }} />
        <Stack.Screen name="shopping-list" options={{ title: 'Shopping list' }} />
        <Stack.Screen name="sample" options={{ title: 'Example card' }} />
        <Stack.Screen name="nudges" options={{ title: 'Nudges' }} />
        {/* A top-level screen like Home: the bottom bar is the way out. */}
        <Stack.Screen name="profile" options={{ title: 'Profile', headerBackVisible: false, headerLeft: () => null }} />
        <Stack.Screen name="shared" options={{ title: 'Shared with me' }} />
        <Stack.Screen name="shared-by-you" options={{ title: 'Shared by you' }} />
        <Stack.Screen name="stashes" options={{ title: 'All stashes' }} />
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
      <BottomNav />
      <NewSharePrompt />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
