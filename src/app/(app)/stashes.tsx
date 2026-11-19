import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { LinkStatusRow } from '@/components/stash-row';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { fetchStashes, STASH_PAGE, type InFlightLink, type StashFilter } from '@/lib/data';

async function fetchPages(
  filter: StashFilter,
  pages: number,
): Promise<{ filter: StashFilter; links: InFlightLink[]; more: boolean }> {
  const links: InFlightLink[] = [];
  for (let page = 0; page < pages; page++) {
    const rows = await fetchStashes(filter, page);
    links.push(...rows);
    if (rows.length < STASH_PAGE) return { filter, links, more: false };
  }
  return { filter, links, more: true };
}

const FILTERS: { value: StashFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'not_sorted', label: 'Not sorted' },
];

/**
 * All stashes (HAN-89): every link, newest first, 30 at a time, so one that was never filed is never out of reach.
 * "Not sorted" narrows it to links where nothing was filed, dismissed ones included.
 */
export default function StashesScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter: StashFilter = params.filter === 'not_sorted' ? 'not_sorted' : 'all';
  const [pages, setPages] = useState(1);
  // Loads pages 0..last again each time, so a stash filed or deleted from its card shows its new state on return.
  const state = useAsync(() => fetchPages(filter, pages), [filter, pages]);
  // Rows for the other filter are hidden while this one loads.
  const links = state.data?.filter === filter ? state.data.links : null;
  const more = state.data?.more ?? false;
  const error = state.error?.message ?? null;
  const { refresh } = state;
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else refresh();
    }, [refresh]),
  );

  // Say how many are shown once a filter or page has loaded. Android and web hear the visible summary line.
  const summary = links
    ? links.length
      ? `${links.length}${more ? '+' : ''} ${filter === 'not_sorted' ? 'not sorted' : links.length === 1 ? 'stash' : 'stashes'}`
      : filter === 'not_sorted'
        ? 'Nothing waiting to be sorted.'
        : 'Nothing saved yet.'
    : null;
  useEffect(() => {
    if (summary) announce(summary);
  }, [summary]);

  return (
    <Screen edges="none" refreshControl={<RefreshControl refreshing={state.loading && !!links} onRefresh={refresh} />}>
      <FilterPicker value={filter} onChange={(value) => {
          if (value === filter) return;
          setPages(1);
          router.setParams({ filter: value });
        }} />
      {error ? (
        <View style={styles.gap}>
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            Couldn’t load your stashes: {error}
          </ThemedText>
          <Button title="Try again" variant="secondary" onPress={refresh} />
        </View>
      ) : null}
      {summary ? (
        <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
          {summary}
        </ThemedText>
      ) : null}
      {state.loading && !links ? <ActivityIndicator style={styles.loading} accessibilityLabel="Loading stashes" /> : null}
      {links?.map((link) => <LinkStatusRow key={link.id} link={link} />)}
      {more ? (
        <Button title="Show more" variant="secondary" onPress={() => setPages(pages + 1)} loading={state.loading} />
      ) : null}
    </Screen>
  );
}

/** All / Not sorted as a radio group; the selected option has a check mark and a thicker border, not just colour. */
function FilterPicker({ value, onChange }: { value: StashFilter; onChange: (value: StashFilter) => void }) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Show" style={styles.segments}>
      {FILTERS.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            aria-checked={selected}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              {
                backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                borderColor: selected ? theme.tint : theme.border,
                borderWidth: selected ? 2 : StyleSheet.hairlineWidth * 2,
              },
              pressed && styles.pressed,
            ]}>
            <ThemedText type={selected ? 'smallBold' : 'small'}>
              {selected ? '✓ ' : ''}
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  segment: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.row,
  },
  gap: { gap: Spacing.two },
  loading: { marginVertical: Spacing.four },
  pressed: { opacity: 0.7 },
});
