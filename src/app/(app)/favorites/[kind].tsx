import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { FavoriteStar } from '@/components/favorite-star';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { fetchFavorites, setItemFavorite } from '@/lib/data';
import { KINDS, type Kind, type LinkItem } from '@/lib/types';

/**
 * The starred items under one kind, e.g. every favorite in Eats across all its lists (HAN-123). Tapping a row opens
 * its list. Unstarring here leaves the row in place with a hollow star until the screen reloads, so a slip is easy
 * to undo.
 */
export default function FavoritesScreen() {
  const params = useLocalSearchParams<{ kind: string }>();
  const kind = (KINDS as readonly string[]).includes(params.kind) ? (params.kind as Kind) : null;
  const favorites = useAsync(() => (kind ? fetchFavorites(kind) : Promise.resolve([])), [kind]);
  const [error, setError] = useState<string | null>(null);

  const { refresh, update } = favorites;
  const setFavoritedAt = useCallback(
    (id: string, at: string | null) => update((items) => items.map((i) => (i.id === id ? { ...i, favorited_at: at } : i))),
    [update],
  );
  const toggle = async (item: LinkItem) => {
    const favorite = !item.favorited_at;
    setError(null);
    setFavoritedAt(item.id, favorite ? new Date().toISOString() : null);
    try {
      setFavoritedAt(item.id, await setItemFavorite(item.id, favorite));
      AccessibilityInfo.announceForAccessibility(
        favorite ? `Added ${item.name} to favorites.` : `Removed ${item.name} from favorites.`,
      );
    } catch {
      setFavoritedAt(item.id, item.favorited_at);
      AccessibilityInfo.announceForAccessibility(`Couldn't save. ${item.name} is unchanged.`);
      setError(`Couldn't save ${item.name}. Check your connection and try again.`);
    }
  };

  // Pick up stars added or cleared on a list screen.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else refresh();
    }, [refresh]),
  );
  const [pulling, setPulling] = useState(false);
  const onPull = useCallback(async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  }, [refresh]);

  if (!kind) {
    return (
      <Screen edges="none">
        <ThemedText themeColor="textSecondary">Unknown kind.</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen edges="none" refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} />}>
      {favorites.error ? <ThemedText themeColor="danger">{favorites.error.message}</ThemedText> : null}
      {error ? (
        <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
      {!favorites.data && !favorites.error ? <ActivityIndicator accessibilityLabel="Loading favorites" /> : null}
      {favorites.data?.length === 0 ? (
        <ThemedText themeColor="textSecondary">
          No favorites yet. Tap the star on any card in a list to add it here.
        </ThemedText>
      ) : null}
      {favorites.data?.map((item) => (
        <FavoriteRow key={item.id} item={item} onToggle={() => toggle(item)} />
      ))}
    </Screen>
  );
}

/** The row opens the item's list; the star beside it is its own VoiceOver/TalkBack element. */
function FavoriteRow({ item, onToggle }: { item: LinkItem; onToggle: () => void }) {
  const theme = useTheme();
  const where = `${item.list.category.name} › ${item.list.name}`;
  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Pressable
        onPress={() => router.push({ pathname: '/list/[listId]', params: { listId: item.list.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, in ${item.list.category.name}, ${item.list.name}`}
        accessibilityHint="Opens its list"
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <ThemedText type="defaultBold">{item.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {where}
        </ThemedText>
        {item.description ? (
          <ThemedText type="small" numberOfLines={2}>
            {item.description}
          </ThemedText>
        ) : null}
      </Pressable>
      <FavoriteStar favorite={!!item.favorited_at} name={item.name} onToggle={onToggle} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  main: { flex: 1, gap: Spacing.one, minHeight: 44 },
  pressed: { opacity: 0.7 },
});
