import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { DeleteButton } from '@/components/delete-button';
import { RenameForm } from '@/components/rename-form';
import { RowLink } from '@/components/row-link';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { deleteCategory, fetchKind, NAME_LIMITS, renameCategory, type KindCategory } from '@/lib/data';
import { groupByPlace } from '@/lib/places';
import { KIND_SUBTITLES, KINDS, type Kind } from '@/lib/types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type GroupBy = 'type' | 'place';
const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'type', label: 'By type' },
  { value: 'place', label: 'By place' },
];
const groupByKey = (kind: Kind) => `kind-group-by:${kind}`;

/**
 * One top-level kind: its categories, each with its lists (e.g. Eats > Restaurants > Denver), or flipped to show
 * each place with its lists (Winter Park > Bakeries, Coffee shops) (HAN-76). The choice is remembered per kind.
 */
export default function KindScreen() {
  const params = useLocalSearchParams<{ kind: string }>();
  const kind = (KINDS as readonly string[]).includes(params.kind) ? (params.kind as Kind) : null;
  const categories = useAsync(() => (kind ? fetchKind(kind) : Promise.resolve([])), [kind]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('type');
  const typeSections = groupBy === 'type' ? categories.data : undefined;
  const places = useMemo(
    () => (groupBy === 'place' ? groupByPlace(categories.data ?? []) : []),
    [groupBy, categories.data],
  );

  useEffect(() => {
    if (!kind) return;
    AsyncStorage.getItem(groupByKey(kind))
      .then((saved) => saved === 'place' && setGroupBy('place'))
      .catch(() => {});
  }, [kind]);
  const chooseGroupBy = (value: GroupBy) => {
    setGroupBy(value);
    setEditingId(null);
    if (kind) AsyncStorage.setItem(groupByKey(kind), value).catch(() => {});
  };

  // Pick up renames and deletions made on a list or card screen.
  const firstFocus = useRef(true);
  const { refresh } = categories;
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else refresh();
    }, [refresh]),
  );

  // Only a pull drives the spinner: setting `refreshing` from code (the focus refresh above) shifts the
  // scroll view under the iOS large title and leaves the title hidden on return (HAN-31).
  const [pulling, setPulling] = useState(false);
  const onPull = useCallback(async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  }, [refresh]);

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
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} />}>
      {categories.error ? <ThemedText themeColor="danger">{categories.error.message}</ThemedText> : null}
      {!categories.data && !categories.error ? <ActivityIndicator /> : null}
      {categories.data?.length === 0 ? (
        <ThemedText themeColor="textSecondary">
          Nothing here yet. {KIND_SUBTITLES[kind]} you stash will be sorted into lists here.
        </ThemedText>
      ) : null}
      {categories.data?.length ? <GroupByPicker value={groupBy} onChange={chooseGroupBy} /> : null}
      {places.map((place) => (
        <View key={place.key} style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
            {place.name.toUpperCase()}
          </ThemedText>
          {place.lists.map((list) => {
            // Show the list's own name when it adds something, e.g. "Winter Park, CO" under WINTER PARK.
            const subtitle = [list.name === place.name ? null : list.name, plural(list.itemCount, 'item')]
              .filter(Boolean)
              .join(' · ');
            return (
              <RowLink
                key={list.id}
                href={{ pathname: '/list/[listId]', params: { listId: list.id } }}
                title={list.categoryName}
                subtitle={subtitle}
                accessibilityLabel={`${list.categoryName} in ${list.name}, ${plural(list.itemCount, 'item')}`}
              />
            );
          })}
        </View>
      ))}
      {typeSections?.map((category) => (
        <View key={category.id} style={styles.section}>
          {editingId === category.id ? (
            <>
              <RenameForm
                fields={[{ key: 'name', label: 'Category', value: category.name, maxLength: NAME_LIMITS.category }]}
                onCancel={() => setEditingId(null)}
                onSave={async ({ name }) => {
                  await renameCategory(category, name);
                  await refresh();
                  setEditingId(null);
                }}
              />
              <DeleteButton
                title={`Delete ${category.name}`}
                confirmTitle={`Delete ${category.name}?`}
                confirmMessage={`This removes ${plural(category.lists.length, 'list')} and ${plural(
                  category.lists.reduce((n, l) => n + l.itemCount, 0),
                  'item',
                )}. It can’t be undone.`}
                onDelete={async () => {
                  await deleteCategory(category.id);
                  setEditingId(null);
                  await refresh();
                }}
              />
            </>
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

/** By type / By place as a radio group; the selected option has a check mark and a thicker border, not just colour. */
function GroupByPicker({ value, onChange }: { value: GroupBy; onChange: (value: GroupBy) => void }) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Group lists" style={styles.segments}>
      {GROUP_BY_OPTIONS.map((option) => {
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
        accessibilityLabel={`Edit ${category.name}`}
        accessibilityHint="Rename or delete this category"
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
  pressed: { opacity: 0.7 },
});
