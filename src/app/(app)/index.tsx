import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { HomePicks } from '@/components/home-picks';
import { KindTile } from '@/components/kind-tile';
import { PinMark } from '@/components/pin-mark';
import { RowLink } from '@/components/row-link';
import { Screen } from '@/components/screen';
import { PendingLinkRow, StashRow } from '@/components/stash-row';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Features } from '@/constants/features';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useHere } from '@/hooks/use-here';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { fetchHomeItems, fetchInFlightLinks, searchItems, searchLists, type ListMatch, type StashItem } from '@/lib/data';
import { toError } from '@/lib/errors';
import { nudgesSupported } from '@/lib/nudge-service';
import { hasPlaces } from '@/lib/picks';
import { KIND_LABELS, type Kind } from '@/lib/types';

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
  const [now, setNow] = useState(() => new Date());
  const search = useDebouncedSearch(query, now);

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

  // Android's back button leaves search before it leaves the app.
  useEffect(() => {
    if (!searching) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setQuery('');
      return true;
    });
    return () => sub.remove();
  }, [searching]);

  function leaveSearch() {
    Keyboard.dismiss();
    setQuery('');
    announce('Back to your stash');
  }

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
        <>
          <BackLink onPress={leaveSearch} />
          <Results query={query.trim()} state={search} />
        </>
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
            <FirstStashGuide />
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
      <ThemedText type="heading" accessibilityRole="header" style={styles.headerTitle}>
        Your stash
      </ThemedText>
      {nudgesSupported ? (
        <Pressable
          onPress={() => router.push('/nudges')}
          accessibilityRole="button"
          accessibilityLabel="Nudges"
          accessibilityHint="Reminders for saved places near you and a weekly digest"
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}>
          <SymbolView name={{ ios: 'bell', android: 'notifications', web: 'notifications' }} tintColor={theme.tint} size={26} />
        </Pressable>
      ) : null}
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

type SearchResult = { items: StashItem[]; lists: ListMatch[] };
type SearchState = { data: SearchResult | undefined; error: Error | undefined; loading: boolean };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Leaves search for the Home screen (HAN-62); clearing the field was the only way back before. */
function BackLink({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back"
      accessibilityHint="Clears the search and returns to your stash"
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
      <SymbolView
        name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
        tintColor={theme.link}
        size={18}
        weight="semibold"
      />
      <ThemedText type="defaultBold" style={{ color: theme.link }}>
        Back
      </ThemedText>
    </Pressable>
  );
}

function Results({ query, state }: { query: string; state: SearchState }) {
  const lists = state.data?.lists ?? [];
  const items = state.data?.items ?? [];
  const summary = state.error
    ? `Couldn’t search: ${state.error.message}`
    : state.data
      ? lists.length || items.length
        ? [lists.length ? plural(lists.length, 'list') : null, items.length ? plural(items.length, 'item') : null]
            .filter(Boolean)
            .join(' and ') + ` ${lists.length + items.length === 1 ? 'matches' : 'match'} “${query}”.`
        : `Nothing matches “${query}”.`
      : null;
  useEffect(() => {
    if (summary) announce(summary);
  }, [summary]);

  if (state.error) return <ErrorNote message={state.error.message} />;
  if (state.loading || !state.data) return <ActivityIndicator style={styles.loading} accessibilityLabel="Searching" />;
  return (
    <>
      <ThemedText themeColor="textSecondary" accessibilityLiveRegion="polite">
        {summary}
      </ThemedText>
      {lists.length ? (
        <>
          <ThemedText type="sectionTitle" style={styles.sectionTitle} accessibilityRole="header">
            Lists
          </ThemedText>
          <View style={styles.list}>
            {lists.map((list) => (
              <RowLink
                key={list.id}
                href={{ pathname: '/list/[listId]', params: { listId: list.id } }}
                title={`${list.category.name} › ${list.name}`}
                subtitle={`${KIND_LABELS[list.category.kind]} · ${plural(list.itemCount, 'item')}`}
              />
            ))}
          </View>
        </>
      ) : null}
      {items.length ? (
        <>
          <ThemedText type="sectionTitle" style={styles.sectionTitle} accessibilityRole="header">
            {lists.length ? 'Items' : 'Results'}
          </ThemedText>
          <View style={styles.list}>
            {items.map((item) => (
              <StashRow key={item.id} item={item} />
            ))}
          </View>
        </>
      ) : null}
    </>
  );
}

const FIRST_STEPS = [
  'Find a post worth keeping: a café list, a weekend trip, a recipe.',
  'Tap Share, then StashtagAI. Or copy the link and tap Stash a link below.',
  'We read the post and sort what it names into Eats, Trips, Recipes or Do.',
];

/** First run (HAN-42): how to stash a first post, and an example of what comes back. Shown while the stash is empty. */
function FirstStashGuide() {
  const theme = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <PinMark size={44} />
      <ThemedText type="defaultBold" accessibilityRole="header">
        Stash your first post
      </ThemedText>
      <View style={styles.guide}>
        {FIRST_STEPS.map((text, i) => (
          <View
            key={text}
            style={styles.guideRow}
            accessible
            accessibilityLabel={`Step ${i + 1} of ${FIRST_STEPS.length}: ${text}`}>
            <View style={[styles.badge, { backgroundColor: theme.tint }]}>
              <ThemedText type="smallBold" style={{ color: theme.onTint }}>
                {i + 1}
              </ThemedText>
            </View>
            <ThemedText type="small" style={styles.flex}>
              {text}
            </ThemedText>
          </View>
        ))}
      </View>
      <Button
        title="See an example"
        variant="secondary"
        style={styles.stretch}
        onPress={() => router.push('/sample')}
        accessibilityHint="Shows a made-up post and the card StashtagAI builds from it"
      />
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

/** Runs `searchItems` and `searchLists` 250 ms after typing stops; results for stale queries are ignored. */
function useDebouncedSearch(query: string, now: Date): SearchState {
  const [result, setResult] = useState<{ query: string; data?: SearchResult; error?: Error }>({ query: '' });
  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all([searchItems(query), searchLists(query)])
        .then(([items, lists]) => !cancelled && setResult({ query, data: { items, lists } }))
        .catch((e: unknown) => !cancelled && setResult({ query, error: toError(e) }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, now]); // `now` changes on refocus, so a list deleted meanwhile drops out of the results
  const current = result.query === query;
  return { data: current ? result.data : undefined, error: current ? result.error : undefined, loading: !current };
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  headerTitle: { flex: 1 },
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
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
  guide: { alignSelf: 'stretch', gap: Spacing.three, marginVertical: Spacing.two },
  guideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  badge: { minWidth: 28, minHeight: 28, borderRadius: Radius.chip, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.one },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  error: { gap: Spacing.two },
  back: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, minHeight: 44, alignSelf: 'flex-start', paddingRight: Spacing.three },
  pressed: { opacity: 0.7 },
});
