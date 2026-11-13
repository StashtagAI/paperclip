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
import { KIND_LABELS, PLATFORM_LABELS, type SharedItem } from '@/lib/types';

/**
 * A list a friend shared (HAN-50): stashtag://s/<token> or <web app>/s/<token>. Outside the signed-in group so it
 * opens signed out too; adding needs an account, and the token is kept across sign-in (see (app)/_layout).
 */
export default function SharedListScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();
  const shared = useAsync(() => fetchSharedList(token), [token]);
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

  async function signInToAdd() {
    await pendingShare.set(token);
    router.replace('/sign-in');
  }

  const footer = list ? (
    <View style={styles.footer}>
      {session ? (
        <Button title="Add to my stash" size="large" loading={adding} onPress={add} />
      ) : (
        <Button title="Sign in to add it to your stash" size="large" onPress={signInToAdd} />
      )}
    </View>
  ) : null;

  return (
    <Screen footer={footer}>
      <Stack.Screen options={{ title: list ? `${list.category} › ${list.list}` : 'Shared list' }} />
      {shared.loading && !shared.data ? <ActivityIndicator accessibilityLabel="Loading the shared list" /> : null}
      {shared.error ? (
        <View style={styles.gap}>
          <ThemedText themeColor="danger" accessibilityRole="alert">
            Couldn’t open the shared list: {shared.error.message}
          </ThemedText>
          <Button title="Try again" variant="secondary" onPress={shared.refresh} />
        </View>
      ) : null}
      {!shared.loading && !shared.error && !list ? <NotShared signedIn={!!session} /> : null}
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
          {session ? <Button title="Not now" variant="secondary" onPress={() => router.replace('/')} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

function NotShared({ signedIn }: { signedIn: boolean }) {
  return (
    <View style={styles.gap}>
      <ThemedText type="sectionTitle" accessibilityRole="header">
        This list isn’t shared any more
      </ThemedText>
      <ThemedText themeColor="textSecondary">The link may be mistyped, or the owner stopped sharing it.</ThemedText>
      <Button
        title={signedIn ? 'Go to your stash' : 'Open Stashtag'}
        variant="secondary"
        onPress={() => router.replace(signedIn ? '/' : '/sign-in')}
      />
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
