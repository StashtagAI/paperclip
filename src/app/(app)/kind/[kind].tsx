import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { DeleteButton } from '@/components/delete-button';
import { RenameForm } from '@/components/rename-form';
import { RowLink } from '@/components/row-link';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { deleteCategory, fetchKind, NAME_LIMITS, renameCategory, type KindCategory, type KindList } from '@/lib/data';
import { progressText } from '@/lib/done-progress';
import { groupByPlace } from '@/lib/places';
import { withSharedLists } from '@/lib/shared-lists';
import { useSharedWithMe } from '@/lib/shared-with-me';
import { recipesLabel } from '@/lib/shopping-list';
import { useShoppingSelection } from '@/lib/shopping-selection';
import { KIND_SUBTITLES, KINDS, type Kind } from '@/lib/types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Where a list row goes: lists friends shared open the shared view (HAN-125). */
const listHref = (list: KindList) =>
  list.sharedBy
    ? ({ pathname: '/shared-list/[listId]', params: { listId: list.id } } as const)
    : ({ pathname: '/list/[listId]', params: { listId: list.id } } as const);

type GroupBy = 'type' | 'place';
const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'type', label: 'By type' },
  { value: 'place', label: 'By place' },
];
// v2: By place became the default, so choices saved under the old key (often just 'type') are ignored.
const groupByKey = (kind: Kind) => `kind-group-by-v2:${kind}`;
// Only kinds whose lists are tied to a place get the switch; Recipes and Do always group by type.
const PLACE_KINDS: readonly Kind[] = ['eats', 'travel'];

/**
 * One top-level kind: its categories, each with its lists (e.g. Eats > Restaurants > Denver), or flipped to show
 * each place with its lists (Winter Park > Bakeries, Coffee shops) (HAN-76). By place is the default; the choice is
 * remembered per kind, and only offered for Eats and Travel.
 */
export default function KindScreen() {
  const params = useLocalSearchParams<{ kind: string }>();
  const kind = (KINDS as readonly string[]).includes(params.kind) ? (params.kind as Kind) : null;
  const own = useAsync(() => (kind ? fetchKind(kind) : Promise.resolve([])), [kind]);
  // Lists friends shared sit under the category of the same name, e.g. Recipes › Dinners (HAN-125).
  const shared = useSharedWithMe();
  const merged = useMemo(
    () => (own.data && kind ? withSharedLists(own.data, shared.data ?? [], kind) : undefined),
    [own.data, shared.data, kind],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedGroupBy, setGroupBy] = useState<GroupBy>('place');
  const canGroupByPlace = kind !== null && PLACE_KINDS.includes(kind);
  const groupBy = canGroupByPlace ? savedGroupBy : 'type';
  const typeSections = groupBy === 'type' ? merged : undefined;
  const places = useMemo(
    () => (groupBy === 'place' ? groupByPlace(merged ?? []) : []),
    [groupBy, merged],
  );

  useEffect(() => {
    if (!kind) return;
    AsyncStorage.getItem(groupByKey(kind))
      .then((saved) => saved === 'type' && setGroupBy('type'))
      .catch(() => {});
  }, [kind]);
  const chooseGroupBy = (value: GroupBy) => {
    setGroupBy(value);
    setEditingId(null);
    if (kind) AsyncStorage.setItem(groupByKey(kind), value).catch(() => {});
  };
  const picked = useShoppingSelection().ids;

  // Pick up renames and deletions made on a list or card screen.
  const firstFocus = useRef(true);
  const { refresh: refreshOwn } = own;
  const { refresh: refreshShared } = shared;
  const refresh = useCallback(() => Promise.all([refreshOwn(), refreshShared()]), [refreshOwn, refreshShared]);
  useEffect(() => {
    refreshShared();
  }, [refreshShared]);
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
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} />}
      footer={
        kind === 'recipes' && picked.length ? (
          <Button
            title={`Shopping list · ${recipesLabel(picked.length)}`}
            size="large"
            onPress={() => router.push('/shopping-list')}
            accessibilityHint="Opens the ingredients for the recipes you picked"
          />
        ) : null
      }>
      {own.error ? <ThemedText themeColor="danger">{own.error.message}</ThemedText> : null}
      {!merged && !own.error ? <ActivityIndicator /> : null}
      {merged?.length === 0 ? (
        <ThemedText themeColor="textSecondary">
          Nothing here yet. {KIND_SUBTITLES[kind]} you stash will be sorted into lists here.
        </ThemedText>
      ) : null}
      {canGroupByPlace && merged?.length ? <GroupByPicker value={groupBy} onChange={chooseGroupBy} /> : null}
      {places.map((place) => (
        <View key={place.key} style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
            {place.name.toUpperCase()}
          </ThemedText>
          {place.lists.map((list) => {
            // Show the list's own name when it adds something, e.g. "Winter Park, CO" under WINTER PARK.
            const shareNote = list.sharedBy ? `Shared by ${list.sharedBy}` : null;
            const subtitle = [list.name === place.name ? null : list.name, shareNote, plural(list.itemCount, 'item')]
              .filter(Boolean)
              .join(' · ');
            return (
              <RowLink
                key={list.id}
                href={listHref(list)}
                title={list.categoryName}
                subtitle={subtitle}
                accessibilityLabel={[`${list.categoryName} in ${list.name}`, shareNote, plural(list.itemCount, 'item')]
                  .filter(Boolean)
                  .join(', ')}
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
                confirmMessage={deleteMessage(category)}
                onDelete={async () => {
                  await deleteCategory(category.id);
                  setEditingId(null);
                  await refresh();
                }}
              />
            </>
          ) : (
            <CategoryHeader category={category} onEdit={category.sharedOnly ? undefined : () => setEditingId(category.id)} />
          )}
          {category.lists.map((list) => (
            <RowLink
              key={list.id}
              href={listHref(list)}
              title={list.name}
              subtitle={
                list.sharedBy
                  ? `Shared by ${list.sharedBy} · ${plural(list.itemCount, 'item')}`
                  : list.doneCount
                    ? progressText(kind, list.doneCount, list.itemCount)
                    : plural(list.itemCount, 'item')
              }
              progress={list.doneCount ? { done: list.doneCount, total: list.itemCount } : undefined}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}

/** What deleting a category removes. Lists friends shared aren't the user's to delete, and stay. */
function deleteMessage(category: KindCategory): string {
  const mine = category.lists.filter((l) => !l.sharedBy);
  const shared = category.lists.length - mine.length;
  const items = mine.reduce((n, l) => n + l.itemCount, 0);
  return `This removes ${plural(mine.length, 'list')} and ${plural(items, 'item')}. It can’t be undone.${
    shared ? ` ${shared === 1 ? 'The list' : 'Lists'} shared with you will stay.` : ''
  }`;
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

/** No Edit on a category that only holds lists friends shared: there's nothing of the user's to rename or delete. */
function CategoryHeader({ category, onEdit }: { category: KindCategory; onEdit?: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.flex}>
        {category.name.toUpperCase()}
      </ThemedText>
      {onEdit ? (
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
      ) : null}
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
