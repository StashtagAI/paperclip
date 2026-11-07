import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { RowLink } from '@/components/row-link';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { fetchKind } from '@/lib/data';
import { KIND_LABELS, KIND_SUBTITLES, KINDS, type Kind } from '@/lib/types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One top-level kind: its categories, each with its lists (e.g. Eats > Restaurants > Denver). */
export default function KindScreen() {
  const params = useLocalSearchParams<{ kind: string }>();
  const kind = (KINDS as readonly string[]).includes(params.kind) ? (params.kind as Kind) : null;
  const categories = useAsync(() => (kind ? fetchKind(kind) : Promise.resolve([])), [kind]);

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
          <ThemedText type="smallBold" themeColor="textSecondary">
            {category.name.toUpperCase()}
          </ThemedText>
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

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
});
