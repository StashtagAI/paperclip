import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { fetchList } from '@/lib/data';
import type { ItemRow } from '@/lib/types';

/** Level 3: the items in one list, e.g. Restaurants > Denver. */
export default function ListScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const list = useAsync(() => fetchList(listId), [listId]);
  const data = list.data;

  return (
    <Screen edges="none">
      <Stack.Screen options={{ title: data ? `${data.category.name} › ${data.name}` : '' }} />
      {list.error ? <ThemedText themeColor="danger">{list.error.message}</ThemedText> : null}
      {list.loading && !data ? <ActivityIndicator /> : null}
      {data?.tags.length ? <Tags tags={data.tags} /> : null}
      {data?.items.length === 0 ? <ThemedText themeColor="textSecondary">No items in this list yet.</ThemedText> : null}
      {data?.items.map((item) => <ItemCard key={item.id} item={item} />)}
    </Screen>
  );
}

function ItemCard({ item }: { item: ItemRow }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="default">{item.name}</ThemedText>
      {item.description ? <ThemedText type="small">{item.description}</ThemedText> : null}
      {item.address ? (
        <ThemedText type="small" themeColor="textSecondary" selectable>
          {item.address}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <View style={styles.tags}>
      {tags.map((tag) => (
        <ThemedView key={tag} type="backgroundSelected" style={styles.tag}>
          <ThemedText type="small">#{tag}</ThemedText>
        </ThemedView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tag: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.two, borderRadius: Spacing.three },
});
