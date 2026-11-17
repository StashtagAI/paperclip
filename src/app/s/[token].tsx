import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TagChip } from '@/components/tag-chip';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { addSharedList, fetchSharedList } from '@/lib/data';
import { pendingShare } from '@/lib/share';
import { supabase } from '@/lib/supabase';
import { KIND_LABELS, PLATFORM_LABELS, type SharedItem } from '@/lib/types';

/**
 * A list a friend shared (HAN-50): stashtag://s/<token> or <web app>/s/<token>. Outside the signed-in group so a
 * signed-out visitor lands here; since HAN-68 only signed-in people the owner shared with can read it, so they're asked
 * to sign in first and the token is kept across sign-in (see (app)/_layout).
 */
export default function SharedListScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id;
  // Signed out there's nothing to fetch: the database only answers signed-in callers.
  const shared = useAsync(() => (userId ? fetchSharedList(token) : Promise.resolve(null)), [token, userId]);
  const list = shared.data;
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setAdding(true);
    setError(null);
    try {
      const result = await addSharedList(token);
      const message = result.own
        ? 'This is your own list.'
        : result.added
          ? `Added ${result.added} ${result.added === 1 ? 'item' : 'items'} to your stash.`
          : 'Everything in this list is already in your stash.';
      AccessibilityInfo.announceForAccessibility(message);
      router.replace({ pathname: '/list/[listId]', params: { listId: result.list_id } });
    } catch (e) {
      const message = `Couldn’t add the list: ${(e as Error).message}`;
      setError(message);
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
      setAdding(false);
    }
  }

  async function signIn() {
    await pendingShare.set(token);
    router.replace('/sign-in');
  }

  async function switchAccount() {
    await pendingShare.set(token);
    await supabase.auth.signOut();
    router.replace('/sign-in');
  }

  const footer =
    session && list ? (
      <View style={styles.footer}>
        <Button title="Add to my stash" size="large" loading={adding} onPress={add} />
      </View>
    ) : null;
  const checking = authLoading || (session && shared.loading && !shared.data);

  return (
    <Screen footer={footer}>
      <Stack.Screen options={{ title: list ? `${list.category} › ${list.list}` : 'Shared list' }} />
      {checking ? <ActivityIndicator accessibilityLabel="Loading the shared list" /> : null}
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
      {list ? (
        <>
          <View style={styles.header}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Shared from Stashtag · {KIND_LABELS[list.kind]}
            </ThemedText>
            <ThemedText type="sectionTitle" accessibilityRole="header">
              {list.category} › {list.list}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {list.items.length} {list.items.length === 1 ? 'item' : 'items'}
            </ThemedText>
          </View>
          {list.tags.length ? (
            <View style={styles.tags}>
              {list.tags.map((tag) => (
                <TagChip key={tag} kind={list.kind} tag={tag.replace(/^#+/, '')} />
              ))}
            </View>
          ) : null}
          {list.items.length === 0 ? <ThemedText themeColor="textSecondary">No items in this list yet.</ThemedText> : null}
          {list.items.map((item) => (
            <SharedItemCard key={item.name} item={item} />
          ))}
          {error ? (
            <ThemedText type="small" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          ) : null}
          <Button title="Not now" variant="secondary" onPress={() => router.replace('/')} />
        </>
      ) : null}
    </Screen>
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

function SharedItemCard({ item }: { item: SharedItem }) {
  const theme = useTheme();
  const platform = item.platform ? PLATFORM_LABELS[item.platform] : 'the post';
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="defaultBold">{item.name}</ThemedText>
      {item.description ? <ThemedText type="small">{item.description}</ThemedText> : null}
      {item.address ? (
        <ThemedText type="small" themeColor="textSecondary" selectable>
          {item.address}
        </ThemedText>
      ) : null}
      {item.source_url ? (
        <Pressable
          onPress={() => Linking.openURL(item.source_url!)}
          accessibilityRole="link"
          accessibilityLabel={`Source post for ${item.name}`}
          accessibilityHint={`Opens ${platform}`}
          hitSlop={8}
          style={styles.source}>
          <ThemedText type="small" style={{ color: theme.tint }}>
            Source post ›
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.one, marginTop: Spacing.two },
  gap: { gap: Spacing.three, marginTop: Spacing.four },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  card: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.one },
  source: { alignSelf: 'flex-start', marginTop: Spacing.one, minHeight: 28, justifyContent: 'center' },
  footer: { gap: Spacing.two },
});
