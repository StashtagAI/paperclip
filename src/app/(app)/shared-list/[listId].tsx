import * as Linking from 'expo-linking';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CheckRow } from '@/components/check-row';
import { Chiclet } from '@/components/chiclet';
import { Screen } from '@/components/screen';
import { TagChip } from '@/components/tag-chip';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { itemNoun as noun } from '@/lib/add-items';
import { announce } from '@/lib/announce';
import { confirmDestructive } from '@/lib/confirm';
import { fetchCollabList, removeSharedItem, type CollabItem } from '@/lib/data';
import { sharerName } from '@/lib/display-name';
import { recipesLabel } from '@/lib/shopping-list';
import { toggleRecipe, useShoppingSelection } from '@/lib/shopping-selection';
import { markSeen, refreshSharedWithMe, useSharedWithMe } from '@/lib/shared-with-me';
import { PLATFORM_LABELS } from '@/lib/types';

/**
 * A list a friend shared with the user (HAN-125), live: what's in it now, and anything they add or remove changes it
 * for everyone it's shared with. It sits in the user's own Kind › Category. The owner's notes, ratings, photos and done
 * marks stay private, so the cards show only what the post said.
 */
export default function SharedListScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const list = useAsync(() => fetchCollabList(listId), [listId]);
  const data = list.data;
  const recipes = data?.kind === 'recipes';
  const picked = useShoppingSelection().ids;
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const token = useSharedWithMe().data?.find((s) => s.list_id === listId && !s.seen_at)?.token;

  // Opening the list counts as seeing it (HAN-71), so the new-share popup doesn't offer it again.
  useEffect(() => {
    if (data && token) markSeen([token]).catch(() => {});
  }, [data, token]);

  // Pick up items added on the add screen, or by friends meanwhile.
  const firstFocus = useRef(true);
  const { refresh } = list;
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

  async function remove(item: CollabItem) {
    if (!data) return;
    const ok = await confirmDestructive(
      `Remove “${item.name}”?`,
      `It comes off ${data.category} › ${data.list} for everyone it’s shared with.`,
      'Remove',
    );
    if (!ok) return;
    setNote(null);
    try {
      await removeSharedItem(item.id);
      const text = `${item.name} removed.`;
      setNote({ text });
      announce(text);
    } catch (e) {
      const text = `Couldn’t remove ${item.name}: ${(e as Error).message}`;
      setNote({ text, error: true });
      announce(text);
    }
    await refresh();
    refreshSharedWithMe();
  }

  const footer = data ? (
    <View style={styles.footer}>
      {recipes && picked.length ? (
        <Button
          title={`Shopping list · ${recipesLabel(picked.length)}`}
          size="large"
          onPress={() => router.push('/shopping-list')}
          accessibilityHint="Opens the ingredients for the recipes you picked"
        />
      ) : null}
      <Button
        title={`Add ${noun(data.kind, 2)}`}
        size="large"
        variant={recipes && picked.length ? 'secondary' : 'primary'}
        onPress={() => router.push({ pathname: '/add-items/[listId]', params: { listId } })}
        accessibilityHint={`Pick ${noun(data.kind, 2)} from your stash to add to this list`}
      />
    </View>
  ) : null;

  return (
    <Screen edges="none" footer={footer} refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} />}>
      <Stack.Screen options={{ title: data ? `${data.category} › ${data.list}` : '' }} />
      {list.loading && list.data === undefined ? <ActivityIndicator accessibilityLabel="Loading the list" /> : null}
      {list.error ? (
        <View style={styles.gap}>
          <ThemedText themeColor="danger" accessibilityRole="alert">
            Couldn’t open the list: {list.error.message}
          </ThemedText>
          <Button title="Try again" variant="secondary" onPress={refresh} />
        </View>
      ) : null}
      {data === null ? (
        <View style={styles.gap}>
          <ThemedText type="sectionTitle" accessibilityRole="header">
            This list isn’t shared with you anymore
          </ThemedText>
          <ThemedText themeColor="textSecondary">The owner may have stopped sharing it, or removed you.</ThemedText>
          <Button title="Go to your stash" variant="secondary" onPress={() => router.replace('/')} />
        </View>
      ) : null}
      {data ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Shared by {sharerName(data.shared_by)}. You can add and remove {noun(data.kind, 2)}; everyone it’s shared
            with sees the same list.
          </ThemedText>
          {data.tags.length ? (
            <View style={styles.tags}>
              {data.tags.map((tag) => (
                <TagChip key={tag} kind={data.kind} tag={tag.replace(/^#+/, '')} />
              ))}
            </View>
          ) : null}
          {note ? (
            <ThemedText
              type="small"
              themeColor={note.error ? 'danger' : 'textSecondary'}
              accessibilityRole={note.error ? 'alert' : undefined}
              accessibilityLiveRegion="polite">
              {note.text}
            </ThemedText>
          ) : null}
          {data.items.length === 0 ? (
            <ThemedText themeColor="textSecondary">No {noun(data.kind, 2)} in this list yet.</ThemedText>
          ) : null}
          {data.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              recipe={recipes ? { picked: picked.includes(item.id), count: picked.length } : undefined}
              onRemove={() => remove(item)}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

type ItemCardProps = {
  item: CollabItem;
  /** Recipe cards: whether it's on the shopping list, and how many recipes are. */
  recipe?: { picked: boolean; count: number };
  onRemove: () => void;
};

function ItemCard({ item, recipe, onRemove }: ItemCardProps) {
  const theme = useTheme();
  const platform = item.platform ? PLATFORM_LABELS[item.platform] : 'the post';
  const toggle = () => {
    if (!recipe) return;
    toggleRecipe(item.id);
    const count = recipe.picked ? recipe.count - 1 : recipe.count + 1;
    announce(`${recipe.picked ? 'Removed from' : 'Added to'} shopping list. ${recipesLabel(count)}.`);
  };
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: recipe?.picked ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: recipe?.picked ? theme.tint : theme.border,
        },
      ]}>
      <ThemedText type="defaultBold">{item.name}</ThemedText>
      {item.description ? <ThemedText type="small">{item.description}</ThemedText> : null}
      {item.address ? (
        <ThemedText type="small" themeColor="textSecondary" selectable>
          {item.address}
        </ThemedText>
      ) : null}
      {recipe ? (
        <CheckRow checked={recipe.picked} onPress={toggle} accessibilityLabel={`Add ${item.name} to shopping list`}>
          <ThemedText type="smallBold">{recipe.picked ? 'On shopping list' : 'Shopping list'}</ThemedText>
        </CheckRow>
      ) : null}
      <View style={styles.chiclets}>
        {recipe ? (
          <Chiclet
            label="Recipe"
            onPress={() => router.push({ pathname: '/recipe/[itemId]', params: { itemId: item.id } })}
            accessibilityLabel={`Recipe for ${item.name}`}
            accessibilityHint="Ingredients and steps"
          />
        ) : null}
        {item.source_url ? (
          <Chiclet
            label="Post"
            onPress={() => Linking.openURL(item.source_url!)}
            accessibilityLabel={`Source post for ${item.name}`}
            accessibilityHint={`Opens ${platform}`}
          />
        ) : null}
        <Chiclet
          icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
          color={theme.danger}
          onPress={onRemove}
          accessibilityLabel={`Remove ${item.name} from this list`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  footer: { gap: Spacing.two },
  tags: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.two, rowGap: Spacing.three },
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: 12,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: Spacing.two,
  },
  // Rows sit 16 apart when they wrap so each chiclet's 48pt hit area doesn't overlap the next row's.
  chiclets: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.one, rowGap: Spacing.three },
});
