import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { KindTile } from '@/components/kind-tile';
import { PinMark } from '@/components/pin-mark';
import { Screen } from '@/components/screen';
import { PendingLinkRow, StashRow } from '@/components/stash-row';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Features } from '@/constants/features';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { fetchInFlightLinks, fetchRecentItems, searchItems, type StashItem } from '@/lib/data';
import type { Kind } from '@/lib/types';

const GRID: Kind[][] = [
  ['eats', 'trips'],
  ['recipes', 'do'],
];

/** Home ("Home screen.pdf"): header + search, the four kinds, and recently stashed items. */
export default function HomeScreen() {
  const recent = useAsync(() => Promise.all([fetchRecentItems(), fetchInFlightLinks()]), []);
  const [query, setQuery] = useState('');
  const search = useDebouncedSearch(query);

  // Pick up new items when coming back from "Stash a link" or a list.
  const firstFocus = useRef(true);
  const { refresh } = recent;
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else refresh();
    }, [refresh]),
  );

  const [items, pending] = recent.data ?? [];
  const searching = query.trim().length > 0;

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={recent.loading && !!recent.data} onRefresh={recent.refresh} />}
      footer={
        <Button
          title="Stash a link"
          size="large"
          onPress={() => router.push('/stash')}
          icon={(color) => (
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor={color} size={22} weight="bold" />
          )}
        />
      }>
      <Header />

      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder="Search cafés, trips, recipes"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Search your stash"
      />

      {searching ? (
        <Results label="Results" state={search} empty={`Nothing matches “${query.trim()}”.`} />
      ) : (
        <>
          <View style={styles.grid}>
            {GRID.map((row) => (
              <View key={row.join()} style={styles.gridRow}>
                {row.map((kind) => (
                  <KindTile key={kind} kind={kind} />
                ))}
              </View>
            ))}
          </View>

          <ThemedText type="sectionTitle" style={styles.sectionTitle}>
            Recently stashed
          </ThemedText>
          {recent.error ? (
            <ErrorNote message={recent.error.message} onRetry={recent.refresh} />
          ) : !recent.data ? (
            <ActivityIndicator style={styles.loading} />
          ) : items?.length || pending?.length ? (
            <View style={styles.list}>
              {pending?.map((link) => <PendingLinkRow key={link.id} link={link} />)}
              {items?.map((item) => <StashRow key={item.id} item={item} />)}
            </View>
          ) : (
            <EmptyStash />
          )}
        </>
      )}
    </Screen>
  );
}

function Header() {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <ThemedText type="heading" accessibilityRole="header">
        Your stash
      </ThemedText>
      <View style={styles.headerActions}>
        {Features.shared ? (
          <Pressable style={[styles.pill, { backgroundColor: theme.backgroundSelected }]} accessibilityRole="button">
            <ThemedText type="smallBold" themeColor="textSecondary">
              Shared
            </ThemedText>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Profile and settings"
          hitSlop={Spacing.two}
          style={({ pressed }) => [styles.profile, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
          <SymbolView
            name={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
            tintColor={theme.tint}
            size={26}
          />
        </Pressable>
      </View>
    </View>
  );
}

type SearchState = { data: StashItem[] | undefined; error: Error | undefined; loading: boolean };

function Results({ label, state, empty }: { label: string; state: SearchState; empty: string }) {
  return (
    <>
      <ThemedText type="sectionTitle" style={styles.sectionTitle}>
        {label}
      </ThemedText>
      {state.error ? (
        <ErrorNote message={state.error.message} />
      ) : state.loading || !state.data ? (
        <ActivityIndicator style={styles.loading} />
      ) : state.data.length ? (
        <View style={styles.list}>
          {state.data.map((item) => (
            <StashRow key={item.id} item={item} />
          ))}
        </View>
      ) : (
        <ThemedText themeColor="textSecondary">{empty}</ThemedText>
      )}
    </>
  );
}

function EmptyStash() {
  const theme = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <PinMark size={44} />
      <ThemedText type="defaultBold">Nothing stashed yet</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        Tap Stash a link and paste an Instagram or TikTok post. We’ll sort it into Eats, Trips, Recipes or Do.
      </ThemedText>
    </View>
  );
}

function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.error}>
      <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
        Couldn’t load your stash: {message}
      </ThemedText>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/** Runs `searchItems` 250 ms after typing stops; results for stale queries are ignored. */
function useDebouncedSearch(query: string): SearchState {
  const [result, setResult] = useState<{ query: string; data?: StashItem[]; error?: Error }>({ query: '' });
  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchItems(query)
        .then((data) => !cancelled && setResult({ query, data }))
        .catch((e: Error) => !cancelled && setResult({ query, error: e }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);
  const current = result.query === query;
  return { data: current ? result.data : undefined, error: current ? result.error : undefined, loading: !current };
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.two },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  profile: { width: 44, height: 44, borderRadius: Radius.chip, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  pill: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.chip },
  grid: { gap: Spacing.three - 2 },
  gridRow: { flexDirection: 'row', gap: Spacing.three - 2 },
  sectionTitle: { marginTop: Spacing.two },
  list: { gap: Spacing.two + 2 },
  loading: { marginVertical: Spacing.four },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  center: { textAlign: 'center' },
  error: { gap: Spacing.two },
});
