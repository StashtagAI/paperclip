import * as Clipboard from 'expo-clipboard';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { Button } from '@/components/button';
import { DirectionsSheet } from '@/components/directions-sheet';
import { PlaceMap } from '@/components/place-map';
import { RenameForm } from '@/components/rename-form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ratingLabel } from '@/components/star-rating';
import { TagChip } from '@/components/tag-chip';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import {
  fetchList,
  fetchListShare,
  fetchSharedList,
  NAME_LIMITS,
  renameCategory,
  renameList,
  shareList,
  stopSharingList,
} from '@/lib/data';
import { hasCoords } from '@/lib/geo';
import { openShareSheet, shareMessage, shareUrl } from '@/lib/share';
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
  const share = useAsync(() => fetchListShare(listId), [listId]);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<{ text: string; error?: boolean } | null>(null);

  const note = (text: string, error = false) => {
    setShareNote({ text, error });
    // The note is a live region on Android and web; iOS needs an explicit announcement.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
  };

  async function startSharing() {
    setSharing(true);
    setShareNote(null);
    try {
      const token = await shareList(listId);
      // Share exactly what a friend will see.
      const shared = await fetchSharedList(token);
      if (!shared) throw new Error('The list couldn’t be read back.');
      const outcome = await openShareSheet(shareMessage(shared, shareUrl(token)), `${shared.category} › ${shared.list}`);
      if (outcome === 'copied') note('List and link copied. Paste them into a message to a friend.');
      else if (outcome === 'shared') note('List shared.');
    } catch (e) {
      note(`Couldn’t share: ${(e as Error).message}`, true);
    } finally {
      setSharing(false);
      share.refresh();
    }
  }

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
    <Screen
      edges="none"
      scrollRef={scrollRef}
      footer={
        data && !editing ? (
          <Button
            title={share.data ? 'Share list again' : 'Share list'}
            size="large"
            loading={sharing}
            onPress={startSharing}
            accessibilityHint="Opens the share sheet with the list and a link to it"
            icon={(color) => (
              <SymbolView
                name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
                tintColor={color}
                size={20}
                weight="semibold"
              />
            )}
          />
        ) : null
      }>
      <Stack.Screen
        options={{
          title: data ? `${data.category.name} › ${data.name}` : '',
          headerRight: () =>
            data && !editing ? (
              <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="Rename" hitSlop={12}>
                <ThemedText type="defaultBold" style={{ color: theme.link }}>
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
      {shareNote ? (
        <ThemedText
          type="small"
          themeColor={shareNote.error ? 'danger' : 'textSecondary'}
          accessibilityLiveRegion="polite"
          accessibilityRole={shareNote.error ? 'alert' : undefined}>
          {shareNote.text}
        </ThemedText>
      ) : null}
      {data && share.data && !editing ? (
        <SharedPanel
          listId={listId}
          token={share.data}
          onCopied={() => note('Link copied.')}
          onStopped={() => {
            share.refresh();
            note('Stopped sharing. The old link no longer works.');
          }}
          onError={(message) => note(message, true)}
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
  // The card is a plain View so VoiceOver can reach the links below; on iOS an accessible Pressable would swallow them.
  return (
    <View
      onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}
      style={[
        styles.card,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: selected ? theme.tint : theme.border,
        },
      ]}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessible={!!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityHint={onPress ? 'Get directions' : undefined}
        accessibilityState={onPress ? { selected } : undefined}
        style={({ pressed }) => [styles.main, { opacity: pressed ? 0.8 : 1 }]}>
        <ThemedText type="defaultBold">{item.name}</ThemedText>
        {item.description ? <ThemedText type="small">{item.description}</ThemedText> : null}
        {item.address ? (
          <ThemedText type="small" themeColor="textSecondary" selectable>
            {item.address}
          </ThemedText>
        ) : null}
      </Pressable>
      {item.rating ? (
        <ThemedText type="small" style={{ color: theme.link }} accessibilityLabel={`Your rating: ${ratingLabel(item.rating)}`}>
          {'★'.repeat(item.rating)}
          {'☆'.repeat(5 - item.rating)}
        </ThemedText>
      ) : null}
      {item.note ? (
        <ThemedText type="small" numberOfLines={2} accessibilityLabel={`Your note: ${item.note}`}>
          {item.note}
        </ThemedText>
      ) : null}
      <View style={styles.links}>
        <Pressable
          onPress={() => router.push({ pathname: '/item/[itemId]', params: { itemId: item.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Notes and photos for ${item.name}`}
          style={styles.link}>
          <ThemedText type="small" style={{ color: theme.link }}>
            Notes & photos ›
          </ThemedText>
        </Pressable>
        {item.link_id ? (
          <Pressable
            onPress={() => router.push({ pathname: '/card/[linkId]', params: { linkId: item.link_id! } })}
            accessibilityRole="button"
            accessibilityLabel={`Source post for ${item.name}`}
            style={styles.link}>
            <ThemedText type="small" style={{ color: theme.link }}>
              Source post ›
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

type SharedPanelProps = {
  listId: string;
  token: string;
  onCopied: () => void;
  onStopped: () => void;
  onError: (message: string) => void;
};

/** Shown while the list is shared: who can see it, and a way to copy the link or stop sharing. */
function SharedPanel({ listId, token, onCopied, onStopped, onError }: SharedPanelProps) {
  const theme = useTheme();
  const [stopping, setStopping] = useState(false);

  async function stop() {
    const ok = await confirmDestructive(
      'Stop sharing this list?',
      'The link stops working for anyone who has it. Lists friends already added stay in their stash.',
      'Stop sharing',
    );
    if (!ok) return;
    setStopping(true);
    try {
      await stopSharingList(listId);
      onStopped();
    } catch (e) {
      onError(`Couldn’t stop sharing: ${(e as Error).message}`);
    } finally {
      setStopping(false);
    }
  }

  return (
    <View style={[styles.shared, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="defaultBold">Shared by link</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Anyone with the link can see this list and add it to their own stash. Your other lists stay private.
      </ThemedText>
      <View style={styles.sharedActions}>
        <Button
          title="Copy link"
          variant="secondary"
          style={styles.sharedAction}
          onPress={async () => {
            await Clipboard.setStringAsync(shareUrl(token));
            onCopied();
          }}
        />
        <Button title="Stop sharing" variant="secondary" style={styles.sharedAction} loading={stopping} onPress={stop} />
      </View>
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
  main: { gap: Spacing.one },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.four },
  link: { minHeight: 44, justifyContent: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  shared: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.two },
  // Side by side when they fit; stacked at large text sizes.
  sharedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  sharedAction: { flexGrow: 1 },
});
