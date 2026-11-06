import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { RowLink } from '@/components/row-link';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { fetchLibrary } from '@/lib/data';
import { KIND_LABELS, KINDS } from '@/lib/types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Level 1: categories, grouped under the four fixed kinds (Eats, Trips, Recipes, Do). */
export default function CategoriesScreen() {
  const library = useAsync(fetchLibrary, []);

  return (
    <Screen edges="none" refreshControl={<RefreshControl refreshing={library.loading && !!library.data} onRefresh={library.refresh} />}>
      {library.error ? <ThemedText themeColor="danger">{library.error.message}</ThemedText> : null}
      {!library.data && !library.error ? <ActivityIndicator /> : null}
      {library.data?.sample ? <SampleBanner /> : null}

      {KINDS.map((kind) => {
        const categories = library.data?.categories.filter((c) => c.kind === kind) ?? [];
        if (!categories.length) return null;
        return (
          <View key={kind} style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {KIND_LABELS[kind].toUpperCase()}
            </ThemedText>
            {categories.map((c) => (
              <RowLink
                key={c.id}
                href={{ pathname: '/lists/[categoryId]', params: { categoryId: c.id } }}
                title={c.name}
                subtitle={plural(c.lists.length, 'list')}
              />
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

function SampleBanner() {
  return (
    <ThemedView type="backgroundSelected" style={styles.banner}>
      <ThemedText type="small">
        Sample lists. Your own appear here once saved links have been processed.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  banner: { padding: Spacing.three, borderRadius: Spacing.three },
});
