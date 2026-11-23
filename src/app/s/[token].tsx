import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { Button } from '@/components/button';
import { HomeBackButton } from '@/components/home-back-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { fetchSharedList } from '@/lib/data';
import { pendingShare } from '@/lib/share';
import { markSeen } from '@/lib/shared-with-me';
import { supabase } from '@/lib/supabase';

/**
 * A link to a list a friend shared (HAN-50): stashtag://s/<token> or <web app>/s/<token>. Outside the signed-in group so
 * a signed-out visitor lands here; since HAN-68 only signed-in people the owner shared with can read it, so they're
 * asked to sign in first and the token is kept across sign-in (see (app)/_layout). Then it opens the list.
 */
export default function SharedListScreen() {
  const theme = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id;
  // Signed out there's nothing to fetch: the database only answers signed-in callers.
  const shared = useAsync(() => (userId ? fetchSharedList(token) : Promise.resolve(null)), [token, userId]);
  const list = shared.data;

  // Since HAN-125 a shared list is the same live list for everyone on it, so the link just opens it (the owner's own
  // list for the owner). Opening it counts as seeing it (HAN-71), so the new-share popup doesn't offer it again.
  useEffect(() => {
    if (!list) return;
    if (!list.own) markSeen([token]).catch(() => {});
    router.replace(
      list.own
        ? { pathname: '/list/[listId]', params: { listId: list.list_id } }
        : { pathname: '/shared-list/[listId]', params: { listId: list.list_id } },
    );
  }, [list, token]);

  async function signIn() {
    await pendingShare.set(token);
    router.replace('/sign-in');
  }

  async function switchAccount() {
    await pendingShare.set(token);
    await supabase.auth.signOut({ scope: 'local' });
    router.replace('/sign-in');
  }

  const checking = authLoading || (session && ((shared.loading && !shared.data) || list));

  return (
    <View style={styles.fill}>
      <Screen edges="none">
        {/* The root stack hides headers; this screen needs one for its back button (HAN-91). */}
        <Stack.Screen
          options={{
            headerShown: true,
            title: list ? `${list.category} › ${list.list}` : 'Shared list',
            headerLeft: router.canGoBack() ? undefined : () => <HomeBackButton />,
            headerBackButtonDisplayMode: 'minimal',
            headerTintColor: theme.tint,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
            headerTitleStyle: { color: theme.text },
          }}
        />
        {checking ? <ActivityIndicator accessibilityLabel="Opening the shared list" /> : null}
        {!authLoading && !session ? <SignInFirst onSignIn={signIn} /> : null}
        {shared.error ? (
          <View style={styles.gap}>
            <ThemedText themeColor="danger" accessibilityRole="alert">
              Couldn’t open the shared list: {shared.error.message}
            </ThemedText>
            <Button title="Try again" variant="secondary" onPress={shared.refresh} />
          </View>
        ) : null}
        {session && !shared.loading && !shared.error && !list ? <NotShared email={session.user.email} onSwitch={switchAccount} /> : null}
      </Screen>
      {/* Signed in, it's part of the app like any other screen, so it gets the bottom bar too. */}
      {session ? <BottomNav /> : null}
    </View>
  );
}

function SignInFirst({ onSignIn }: { onSignIn: () => void }) {
  return (
    <View style={styles.gap}>
      <ThemedText type="sectionTitle" accessibilityRole="header">
        Sign in to see this list
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        Shared lists open only for the people they were shared with. After you sign in, this list opens again.
      </ThemedText>
      <Button title="Sign in" size="large" onPress={onSignIn} />
    </View>
  );
}

/** Same screen for a mistyped link, a stopped share and a list shared with someone else: the database can't tell. */
function NotShared({ email, onSwitch }: { email?: string; onSwitch: () => void }) {
  return (
    <View style={styles.gap}>
      <ThemedText type="sectionTitle" accessibilityRole="header">
        You can’t open this list
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        The link may be mistyped, the owner may have stopped sharing it, or it wasn’t shared with
        {email ? ` ${email}` : ' this account'}. If your friend added a different email, sign in with that one.
      </ThemedText>
      <Button title="Sign in with another account" onPress={onSwitch} />
      <Button title="Go to your stash" variant="secondary" onPress={() => router.replace('/')} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  gap: { gap: Spacing.three, marginTop: Spacing.four },
});
