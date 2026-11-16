import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { HomePicks } from '@/components/home-picks';
import { KindTile } from '@/components/kind-tile';
import { PinMark } from '@/components/pin-mark';
import { Screen } from '@/components/screen';
import { PendingLinkRow, StashRow } from '@/components/stash-row';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Features } from '@/constants/features';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useHere } from '@/hooks/use-here';
import { useTheme } from '@/hooks/use-theme';
import { fetchHomeItems, fetchInFlightLinks, searchItems, type StashItem } from '@/lib/data';
import { hasPlaces } from '@/lib/picks';
import type { Kind } from '@/lib/types';

const GRID: Kind[][] = [
  ['eats', 'trips'],
  ['recipes', 'do'],
];

const RECENT_COUNT = 20;

/**
 * Home ("Home screen.pdf"): header + search, the four kinds, picks from the stash (Tonight / Near you / Try this week,
 * HAN-48), and recently stashed items.
 */
export default function HomeScreen() {
  const recent = useAsync(() => Promise.all([fetchHomeItems(), fetchInFlightLinks()]), []);
  const [query, setQuery] = useState('');
  const search = useDebouncedSearch(query);
  const [now, setNow] = useState(() => new Date());

  const [items, pending] = recent.data ?? [];
  const location = useHere(!!items && hasPlaces(items));

  // Pick up new items (and the time of day) when coming back from "Stash a link" or a list.
  const firstFocus = useRef(true);
  const { refresh } = recent;
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else {
        refresh();
        setNow(new Date());
      }
    }, [refresh]),
  );

  function pullToRefresh() {
    refresh();
    setNow(new Date());
    location.refresh();
  }

  const searching = query.trim().length > 0;

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={recent.loading && !!recent.data} onRefresh={pullToRefresh} />}
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

          {items?.length ? <HomePicks items={items} now={now} here={location.here} onUseLocation={location.request} /> : null}

          <ThemedText type="sectionTitle" style={styles.sectionTitle} accessibilityRole="header">
            Recently stashed
          </ThemedText>
          {recent.error ? (
            <ErrorNote message={recent.error.message} onRetry={recent.refresh} />
          ) : !recent.data ? (
            <ActivityIndicator style={styles.loading} />
          ) : items?.length || pending?.length ? (
            <View style={styles.list}>
              {pending?.map((link) => <PendingLinkRow key={link.id} link={link} onRemoved={refresh} />)}
              {items?.slice(0, RECENT_COUNT).map((item) => <StashRow key={item.id} item={item} />)}
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
      {Features.shared ? (
        <Pressable style={[styles.pill, { backgroundColor: theme.backgroundSelected }]} accessibilityRole="button">
          <ThemedText type="smallBold" themeColor="textSecondary">
            Shared
          </ThemedText>
        </Pressable>
      ) : null}
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
