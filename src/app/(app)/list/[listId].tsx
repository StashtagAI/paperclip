import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { DirectionsSheet } from '@/components/directions-sheet';
import { PlaceMap } from '@/components/place-map';
import { RenameForm } from '@/components/rename-form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from '@/components/tag-chip';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { fetchList, NAME_LIMITS, renameCategory, renameList } from '@/lib/data';
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
          selected={item.id === selectedId}
          onPress={places ? () => select(item) : undefined}
          onLayoutY={(y) => rowY.current.set(item.id, y)}
        />
      ))}
      {places ? <DirectionsSheet item={sheetItem} city={data?.name} onClose={() => setSheetItem(null)} /> : null}
    </Screen>
  );
}

type ItemCardProps = { item: ItemRow; selected: boolean; onPress?: () => void; onLayoutY: (y: number) => void };

function ItemCard({ item, selected, onPress, onLayoutY }: ItemCardProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? 'Get directions' : undefined}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: selected ? theme.tint : theme.border,
          opacity: pressed && onPress ? 0.8 : 1,
        },
      ]}>
      <ThemedText type="defaultBold">{item.name}</ThemedText>
      {item.description ? <ThemedText type="small">{item.description}</ThemedText> : null}
      {item.address ? (
        <ThemedText type="small" themeColor="textSecondary" selectable>
          {item.address}
        </ThemedText>
      ) : null}
      {item.link_id ? (
        <Pressable
          onPress={() => router.push({ pathname: '/card/[linkId]', params: { linkId: item.link_id! } })}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.source}>
          <ThemedText type="small" style={{ color: theme.tint }}>
            Source post ›
          </ThemedText>
        </Pressable>
      ) : null}
    </Pressable>
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
  source: { alignSelf: 'flex-start', marginTop: Spacing.one },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
