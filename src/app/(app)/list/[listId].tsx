import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from '@/components/tag-chip';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { fetchList } from '@/lib/data';
import type { ItemRow, Kind } from '@/lib/types';

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
      {data?.tags.length ? <Tags kind={data.category.kind} tags={data.tags} /> : null}
      {data?.items.length === 0 ? <ThemedText themeColor="textSecondary">No items in this list yet.</ThemedText> : null}
      {data?.items.map((item) => <ItemCard key={item.id} item={item} />)}
    </Screen>
  );
}

function ItemCard({ item }: { item: ItemRow }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="defaultBold">{item.name}</ThemedText>
      {item.description ? <ThemedText type="small">{item.description}</ThemedText> : null}
      {item.address ? (
        <ThemedText type="small" themeColor="textSecondary" selectable>
          {item.address}
        </ThemedText>
      ) : null}
    </View>
  );
}

function Tags({ kind, tags }: { kind: Kind; tags: string[] }) {
  return (
    <View style={styles.tags}>
      {tags.map((tag) => (
        <TagChip key={tag} kind={kind} tag={tag.replace(/^#+/, '')} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.one },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
