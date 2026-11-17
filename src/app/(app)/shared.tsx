import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import type { SharedWithMe } from '@/lib/data';
import { listTitle, markSeen, unseen, useSharedWithMe } from '@/lib/shared-with-me';
import { KIND_LABELS } from '@/lib/types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Lists friends shared with you (HAN-71), newest first, with who shared each. A row opens the list at /s/<token>, where
 * Add copies it into your stash. "New" marks the ones that were new when you opened this screen; opening it marks them
 * seen so the popup doesn't show them again.
 */
export default function SharedWithMeScreen() {
  const { data, error, loading, refresh } = useSharedWithMe();
  const [fresh, setFresh] = useState<Set<string> | null>(null);

  // The first fetch decides which rows say "New" while the screen is open; they're then marked seen.
  const first = useRef(true);
  const load = useCallback(async () => {
    const rows = await refresh();
    if (!rows || !first.current) return;
    first.current = false;
    const tokens = unseen(rows).map((s) => s.token);
    setFresh(new Set(tokens));
    markSeen(tokens).catch(() => {});
  }, [refresh]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const summary = error ? `Couldn’t load shared lists: ${error.message}` : data ? `${plural(data.length, 'list')} shared with you` : null;
  useEffect(() => {
    if (summary) announce(summary);
  }, [summary]);

  return (
    <Screen edges="none" refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={load} />}>
      {error ? (
        <View style={styles.gap}>
          <ThemedText themeColor="danger" accessibilityRole="alert">
            {summary}
          </ThemedText>
          <Button title="Try again" variant="secondary" onPress={load} />
        </View>
      ) : !data || !fresh ? (
        <ActivityIndicator style={styles.loading} accessibilityLabel="Loading shared lists" />
      ) : data.length === 0 ? (
        <ThemedText themeColor="textSecondary">
          Nothing has been shared with you yet. When a friend shares a list with the email you sign in with, it shows up
          here.
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
            {summary}
          </ThemedText>
          <View style={styles.list}>
            {data.map((s) => (
              <SharedRow key={s.token} share={s} isNew={!!fresh?.has(s.token)} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function SharedRow({ share, isNew }: { share: SharedWithMe; isNew: boolean }) {
  const theme = useTheme();
  const title = listTitle(share);
  const details = `${KIND_LABELS[share.kind]} · ${plural(share.item_count, 'item')} · ${date(share.shared_at)}`;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/s/[token]', params: { token: share.token } })}
      accessibilityRole="button"
      accessibilityLabel={`${isNew ? 'New. ' : ''}${title}, shared by ${share.shared_by}. ${details}`}
      accessibilityHint="Opens the list"
      style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.text}>
          {isNew ? (
            <View style={[styles.badge, { backgroundColor: theme.tint }]}>
              <ThemedText type="smallBold" style={{ color: theme.onTint }}>
                New
              </ThemedText>
            </View>
          ) : null}
          <ThemedText type="defaultBold">{title}</ThemedText>
          <ThemedText type="small">From {share.shared_by}</ThemedText>
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
    padding: Spacing.three,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: Spacing.two,
  },
  text: { flex: 1, gap: Spacing.half },
  badge: { alignSelf: 'flex-start', paddingHorizontal: Spacing.two, paddingVertical: Spacing.half, borderRadius: Radius.chip },
  pressed: { opacity: 0.7 },
});
