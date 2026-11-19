import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { fetchSharedByMe, type SharedByMe } from '@/lib/data';
import { itemCount, recipientsText } from '@/lib/shared-by-me';
import { listTitle } from '@/lib/shared-with-me';

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * The lists you've shared (HAN-75), newest first, with who each is shared with. A row opens the list, where the share
 * controls add and remove people, send the link and stop sharing.
 */
export default function SharedByYouScreen() {
  const { data, error, loading, refresh } = useAsync(fetchSharedByMe, []);

  // Reload when coming back from a list, in case its sharing changed.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else refresh();
    }, [refresh]),
  );

  const summary = error
    ? `Couldn’t load your shared lists: ${error.message}`
    : data
      ? `You’ve shared ${data.length} ${data.length === 1 ? 'list' : 'lists'}`
      : null;
  useEffect(() => {
    if (summary) announce(summary);
  }, [summary]);

  return (
    <Screen edges="none" refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={refresh} />}>
      {error ? (
        <View style={styles.gap}>
          <ThemedText themeColor="danger" accessibilityRole="alert">
            {summary}
          </ThemedText>
          <Button title="Try again" variant="secondary" onPress={refresh} />
        </View>
      ) : !data ? (
        <ActivityIndicator style={styles.loading} accessibilityLabel="Loading your shared lists" />
      ) : data.length === 0 ? (
        <ThemedText themeColor="textSecondary">
          You haven’t shared any lists. Open a list and tap Share list to share it with a friend.
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
            {summary}
          </ThemedText>
          <View style={styles.list}>
            {data.map((s) => (
              <SharedByYouRow key={s.token} share={s} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function SharedByYouRow({ share }: { share: SharedByMe }) {
  const theme = useTheme();
  const title = listTitle(share);
  const who = recipientsText(share.recipients);
  const details = `${itemCount(share.item_count)} · Shared ${date(share.shared_at)}`;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/list/[listId]', params: { listId: share.list_id } })}
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${itemCount(share.item_count)}. ${who}. Shared ${date(share.shared_at)}`}
      accessibilityHint="Opens the list, where you can change who it’s shared with"
      style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.text}>
          <ThemedText type="defaultBold">{title}</ThemedText>
          <ThemedText type="small">{who}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {details}
          </ThemedText>
        </View>
        <ThemedText themeColor="textSecondary">›</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  loading: { marginVertical: Spacing.four },
  list: { gap: Spacing.two + 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    padding: Spacing.three,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: Spacing.two,
  },
  text: { flex: 1, gap: Spacing.half },
  pressed: { opacity: 0.7 },
});
