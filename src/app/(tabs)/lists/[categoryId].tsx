import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { RowLink } from '@/components/row-link';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useAsync } from '@/hooks/use-async';
import { fetchLibrary } from '@/lib/data';
import { KIND_LABELS } from '@/lib/types';

/** Level 2: the lists (scopes such as "Denver") inside one category. */
export default function CategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const library = useAsync(fetchLibrary, []);
  const category = library.data?.categories.find((c) => c.id === categoryId);

  return (
    <Screen edges="none">
      <Stack.Screen options={{ title: category?.name ?? '' }} />
      {library.error ? <ThemedText themeColor="danger">{library.error.message}</ThemedText> : null}
      {library.loading && !library.data ? <ActivityIndicator /> : null}
      {library.data && !category ? <ThemedText themeColor="textSecondary">Category not found.</ThemedText> : null}
      {category ? (
        <ThemedText type="small" themeColor="textSecondary">
          {KIND_LABELS[category.kind]}
        </ThemedText>
      ) : null}
      {category?.lists.map((list) => (
        <RowLink
          key={list.id}
          href={{ pathname: '/lists/list/[listId]', params: { listId: list.id } }}
          title={list.name}
          subtitle={`${list.itemCount} ${list.itemCount === 1 ? 'item' : 'items'}`}
        />
      ))}
    </Screen>
  );
}
