import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { DirectionsSheet } from '@/components/directions-sheet';
import { ItemEditForm, ReportItemForm } from '@/components/item-forms';
import { PlaceMap } from '@/components/place-map';
import { RenameForm } from '@/components/rename-form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from '@/components/tag-chip';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { deleteItem, fetchList, NAME_LIMITS, renameCategory, renameList } from '@/lib/data';
import { provenanceOf, type ItemSources } from '@/lib/provenance';
import { hasCoords } from '@/lib/geo';
import type { ItemRow, Kind } from '@/lib/types';

/** Kinds whose items are places: their lists get a map and directions (HAN-24). */
const PLACE_KINDS: readonly Kind[] = ['eats', 'trips'];

/** Level 3: the items in one list, e.g. Restaurants > Denver. */
export default function ListScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const list = useAsync(() => fetchList(listId), [listId]);
  const data = list.data;
  const places = !!data && PLACE_KINDS.includes(data.category.kind);
  const pins = places ? data.items.flatMap((i) => (hasCoords(i) ? [{ id: i.id, name: i.name, lat: i.lat, lng: i.lng }] : [])) : [];

  const scrollRef = useRef<ScrollViewInstance>(null);
  const rowY = useRef(new Map<string, number>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetItem, setSheetItem] = useState<ItemRow | null>(null);

  const select = (item: ItemRow) => {
    setSelectedId(item.id);
    setSheetItem(item);
  };
  const selectPin = (id: string) => {
    const item = data?.items.find((i) => i.id === id);
    if (!item) return;
    const y = rowY.current.get(id);
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - Spacing.four), animated: true });
    select(item);
  };

  const [editing, setEditing] = useState(false);
  const theme = useTheme();

  // Pick up a stash deleted from its card.
  const firstFocus = useRef(true);
  const { refresh } = list;
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else refresh();
    }, [refresh]),
  );

  return (
    <Screen edges="none" scrollRef={scrollRef}>
      <Stack.Screen
        options={{
          title: data ? `${data.category.name} › ${data.name}` : '',
          headerRight: () =>
            data && !editing ? (
              <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="Rename" hitSlop={12}>
                <ThemedText type="defaultBold" style={{ color: theme.tint }}>
                  Edit
                </ThemedText>
              </Pressable>
            ) : null,
        }}
      />
      {list.error ? <ThemedText themeColor="danger">{list.error.message}</ThemedText> : null}
      {list.loading && !data ? <ActivityIndicator /> : null}
      {data && editing ? (
        <RenameForm
          fields={[
            { key: 'category', label: 'Category', value: data.category.name, maxLength: NAME_LIMITS.category },
            { key: 'list', label: 'List', value: data.name, maxLength: NAME_LIMITS.list },
          ]}
          onCancel={() => setEditing(false)}
          onSave={async (changed) => {
            if (changed.category !== undefined) await renameCategory(data.category, changed.category);
            if (changed.list !== undefined) await renameList(data, changed.list);
            await refresh();
            setEditing(false);
          }}
        />
      ) : null}
      {pins.length ? <PlaceMap pins={pins} selectedId={selectedId} onPinPress={selectPin} /> : null}
      {data?.tags.length ? <Tags kind={data.category.kind} tags={data.tags} /> : null}
      {data?.items.length === 0 ? <ThemedText themeColor="textSecondary">No items in this list yet.</ThemedText> : null}
      {data?.items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          sources={item.link_id ? data.sources[item.link_id]?.[item.name] : undefined}
          onChanged={refresh}
          selected={item.id === selectedId}
          onPress={places ? () => select(item) : undefined}
          onLayoutY={(y) => rowY.current.set(item.id, y)}
        />
      ))}
      {places ? <DirectionsSheet item={sheetItem} city={data?.name} onClose={() => setSheetItem(null)} /> : null}
    </Screen>
  );
}

type ItemCardProps = {
  item: ItemRow;
  sources: ItemSources | undefined;
  selected: boolean;
  onPress?: () => void;
  onLayoutY: (y: number) => void;
  onChanged: () => Promise<unknown> | void;
};

function ItemCard({ item, sources, selected, onPress, onLayoutY, onChanged }: ItemCardProps) {
  const theme = useTheme();
  const [mode, setMode] = useState<'view' | 'edit' | 'report'>('view');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const provenance = provenanceOf(item, sources);

  const finish = async (message: string | null) => {
    setMode('view');
    setNotice(message);
    await onChanged();
  };

  async function remove() {
    if (!(await confirmDestructive(`Delete “${item.name}”?`, 'This removes it from your list. It can’t be undone.', 'Delete'))) return;
    setError(null);
    try {
      await deleteItem(item.id);
      AccessibilityInfo.announceForAccessibility(`${item.name} deleted`);
      await onChanged();
    } catch (e) {
      setError(`Couldn’t delete: ${(e as Error).message}`);
    }
  }

  if (mode === 'edit') return <ItemEditForm item={item} onDone={(saved) => finish(saved ? 'Saved.' : null)} />;
  if (mode === 'report')
    return <ReportItemForm item={item} onDone={(r) => finish(r === 'sent' ? 'Report sent. Thanks.' : null)} />;

  return (
    <View
      onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}
      style={[
        styles.card,
        { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement, borderColor: selected ? theme.tint : theme.border },
      ]}>
      <Pressable
        onPress={onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityHint={onPress ? 'Get directions' : undefined}
        style={({ pressed }) => [styles.body, { opacity: pressed && onPress ? 0.8 : 1 }]}>
        <ThemedText type="defaultBold">{item.name}</ThemedText>
        <View style={[styles.badge, { borderColor: theme.border }]} accessibilityLabel={provenance.detail}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {provenance.badge}
          </ThemedText>
        </View>
        {item.description ? <ThemedText type="small">{item.description}</ThemedText> : null}
        {item.address ? (
          <ThemedText type="small" themeColor="textSecondary" selectable>
            {item.address}
          </ThemedText>
        ) : null}
      </Pressable>
      {item.link_id ? (
        <Pressable
          onPress={() => router.push({ pathname: '/card/[linkId]', params: { linkId: item.link_id! } })}
          accessibilityRole="button"
          accessibilityLabel={`Source post for ${item.name}`}
          hitSlop={8}
          style={styles.action}>
          <ThemedText type="small" style={{ color: theme.tint }}>
            Source post ›
          </ThemedText>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        {(
          [
            ['Edit', () => setMode('edit')],
            ['Wrong?', () => setMode('report')],
            ['Delete', remove],
          ] as const
        ).map(([label, onPress]) => (
          <Pressable
            key={label}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label === 'Wrong?' ? `Report ${item.name} as wrong` : `${label} ${item.name}`}
            hitSlop={4}
            style={styles.action}>
            <ThemedText type="smallBold" style={{ color: label === 'Delete' ? theme.danger : theme.tint }}>
              {label}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      {notice ? (
        <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
          {notice}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {error}
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
  body: { gap: Spacing.one },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: Radius.row, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.four },
  action: { minHeight: 48, justifyContent: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
