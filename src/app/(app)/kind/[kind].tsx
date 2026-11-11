import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { RenameForm } from '@/components/rename-form';
import { RowLink } from '@/components/row-link';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { fetchKind, NAME_LIMITS, renameCategory, type KindCategory } from '@/lib/data';
import { KIND_LABELS, KIND_SUBTITLES, KINDS, type Kind } from '@/lib/types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One top-level kind: its categories, each with its lists (e.g. Eats > Restaurants > Denver). */
export default function KindScreen() {
  const params = useLocalSearchParams<{ kind: string }>();
  const kind = (KINDS as readonly string[]).includes(params.kind) ? (params.kind as Kind) : null;
  const categories = useAsync(() => (kind ? fetchKind(kind) : Promise.resolve([])), [kind]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Pick up renames and deletions made on a list or card screen.
  const firstFocus = useRef(true);
  const { refresh } = categories;
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else refresh();
    }, [refresh]),
  );

  if (!kind) {
    return (
      <Screen edges="none">
        <ThemedText themeColor="textSecondary">Unknown kind.</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen
      edges="none"
      refreshControl={<RefreshControl refreshing={categories.loading && !!categories.data} onRefresh={categories.refresh} />}>
      <Stack.Screen options={{ title: KIND_LABELS[kind] }} />
      {categories.error ? <ThemedText themeColor="danger">{categories.error.message}</ThemedText> : null}
      {!categories.data && !categories.error ? <ActivityIndicator /> : null}
      {categories.data?.length === 0 ? (
        <ThemedText themeColor="textSecondary">
          Nothing here yet. {KIND_SUBTITLES[kind]} you stash will be sorted into lists here.
        </ThemedText>
      ) : null}
      {categories.data?.map((category) => (
        <View key={category.id} style={styles.section}>
          {editingId === category.id ? (
            <RenameForm
              fields={[{ key: 'name', label: 'Category', value: category.name, maxLength: NAME_LIMITS.category }]}
              onCancel={() => setEditingId(null)}
              onSave={async ({ name }) => {
                await renameCategory(category, name);
                await refresh();
                setEditingId(null);
              }}
            />
          ) : (
            <CategoryHeader category={category} onEdit={() => setEditingId(category.id)} />
          )}
          {category.lists.map((list) => (
            <RowLink
              key={list.id}
              href={{ pathname: '/list/[listId]', params: { listId: list.id } }}
              title={list.name}
              subtitle={plural(list.itemCount, 'item')}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}

function CategoryHeader({ category, onEdit }: { category: KindCategory; onEdit: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.flex}>
        {category.name.toUpperCase()}
      </ThemedText>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Rename ${category.name}`}
        hitSlop={12}>
        <ThemedText type="smallBold" style={{ color: theme.tint }}>
          Edit
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
});
