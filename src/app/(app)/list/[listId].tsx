import * as Clipboard from 'expo-clipboard';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { Button } from '@/components/button';
import { CheckRow } from '@/components/check-row';
import { Chiclet } from '@/components/chiclet';
import { DeleteButton } from '@/components/delete-button';
import { DirectionsSheet } from '@/components/directions-sheet';
import { DisplayNameForm } from '@/components/display-name-form';
import { DoneCheck } from '@/components/done-check';
import { FavoriteStar } from '@/components/favorite-star';
import { PlaceFacts } from '@/components/google-place-info';
import { ItemEditForm, ReportItemForm } from '@/components/item-forms';
import { PlaceMap } from '@/components/place-map';
import { ProgressBar } from '@/components/progress-bar';
import { RenameForm } from '@/components/rename-form';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ratingLabel } from '@/components/star-rating';
import { TagChip } from '@/components/tag-chip';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { confirmDestructive } from '@/lib/confirm';
import {
  addShareRecipient,
  deleteItem,
  deleteList,
  fetchDisplayName,
  fetchList,
  fetchListShare,
  fetchShareRecipients,
  NAME_LIMITS,
  refreshPlaceDetails,
  removeShareRecipient,
  renameCategory,
  renameList,
  setItemDone,
  setItemFavorite,
  shareList,
  stopSharingList,
} from '@/lib/data';
import { doneAnnouncement, progressText } from '@/lib/done-progress';
import { hasCoords } from '@/lib/geo';
import { provenanceOf, type ItemSources } from '@/lib/provenance';
import { openShareSheet, shareMessage, shareUrl } from '@/lib/share';
import { recipesLabel } from '@/lib/shopping-list';
import { toggleRecipe, useShoppingSelection } from '@/lib/shopping-selection';
import { filterByTag, tagCounts } from '@/lib/tag-filter';
import { DONE_LABELS, type ItemRow, type Kind } from '@/lib/types';

/** Kinds whose items are places: their lists get a map and directions (HAN-24). */
const PLACE_KINDS: readonly Kind[] = ['eats', 'travel'];

/** Level 3: the items in one list, e.g. Restaurants > Denver. */
export default function ListScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const list = useAsync(() => fetchList(listId), [listId]);
  const data = list.data;
  const places = !!data && PLACE_KINDS.includes(data.category.kind);
  const recipes = data?.category.kind === 'recipes';
  const picked = useShoppingSelection().ids;
  // Tapping a #tag narrows the list and its map to the items from posts with that tag (HAN-79).
  const [tag, setTag] = useState<string | null>(null);
  const tags = data ? tagCounts(data.tags, data.items) : [];
  const activeTag = tags.some((t) => t.tag === tag) ? tag : null;
  const shown = data ? filterByTag(data.items, activeTag) : [];
  const pins = places ? shown.flatMap((i) => (hasCoords(i) ? [{ id: i.id, name: i.name, lat: i.lat, lng: i.lng }] : [])) : [];

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

  const pickTag = (next: string | null) => {
    if (!data) return;
    const { items, category } = data;
    setTag(next);
    setSelectedId(null);
    setSheetItem(null);
    announce(
      next
        ? tagStatus(filterByTag(items, next).length, items.length, category.kind, next)
        : `Showing all ${items.length} ${itemNoun(category.kind, items.length)}.`,
    );
  };

  const [editing, setEditing] = useState(false);
  const theme = useTheme();
  // The share and who it's for (HAN-68). A share with nobody on it opens only for the owner.
  const share = useAsync(async () => {
    const [token, name] = await Promise.all([fetchListShare(listId), fetchDisplayName()]);
    return { token, name, recipients: token ? await fetchShareRecipients(token) : [] };
  }, [listId]);
  const token = share.data?.token ?? null;
  const recipients = share.data?.recipients ?? [];
  const ownerName = share.data?.name ?? null;
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<{ text: string; error?: boolean } | null>(null);

  const note = (text: string, error = false) => {
    setShareNote({ text, error });
    // The note is a live region on Android and web; iOS needs an explicit announcement.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
  };

  async function sendLink() {
    if (!token || !data) return;
    setSharing(true);
    setShareNote(null);
    try {
      const title = `${data.category.name} › ${data.name}`;
      const outcome = await openShareSheet(shareMessage(data.category.name, data.name, shareUrl(token)), title);
      if (outcome === 'copied') note('Link copied. Paste it into a message to the people you added.');
      else if (outcome === 'shared') note('Link sent.');
    } catch (e) {
      note(`Couldn’t share: ${(e as Error).message}`, true);
    } finally {
      setSharing(false);
      share.refresh();
    }
  }

  const showShare = !!data && !editing && !!share.data && (recipients.length > 0 || !(token || shareOpen));
  // Picked recipes can come from several lists (HAN-74), so the button shows on every recipe list.
  const showShopping = !!data && !editing && recipes && picked.length > 0;

  const total = data?.items.length ?? 0;
  const doneCount = data?.items.filter((i) => i.done_at).length ?? 0;
  const doneLabel = data ? DONE_LABELS[data.category.kind] : '';

  // Optimistic: the check flips at once, then reverts if the save fails. Either way VoiceOver/TalkBack hear the result.
  const [toggleError, setToggleError] = useState<string | null>(null);
  const { update } = list;
  const setDoneAt = useCallback(
    (id: string, doneAt: string | null) =>
      update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, done_at: doneAt } : i)) })),
    [update],
  );
  const toggleDone = async (item: ItemRow) => {
    if (!data) return;
    const kind = data.category.kind;
    const done = !item.done_at;
    setDoneAt(item.id, done ? new Date().toISOString() : null);
    try {
      setDoneAt(item.id, await setItemDone(item.id, done));
      AccessibilityInfo.announceForAccessibility(
        doneAnnouncement(kind, item.name, done, doneCount + (done ? 1 : -1), total),
      );
    } catch {
      setDoneAt(item.id, item.done_at);
      AccessibilityInfo.announceForAccessibility(`Couldn't save. ${item.name} is unchanged.`);
      setToggleError(`Couldn't save ${item.name}. Check your connection and try again.`);
    }
  };

  // The favorite star (HAN-123) works the same way: flips at once, reverts if the save fails.
  const setFavoritedAt = useCallback(
    (id: string, at: string | null) =>
      update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, favorited_at: at } : i)) })),
    [update],
  );
  const toggleFavorite = async (item: ItemRow) => {
    const favorite = !item.favorited_at;
    setFavoritedAt(item.id, favorite ? new Date().toISOString() : null);
    try {
      setFavoritedAt(item.id, await setItemFavorite(item.id, favorite));
      AccessibilityInfo.announceForAccessibility(
        favorite ? `Added ${item.name} to favorites.` : `Removed ${item.name} from favorites.`,
      );
    } catch {
      setFavoritedAt(item.id, item.favorited_at);
      AccessibilityInfo.announceForAccessibility(`Couldn't save. ${item.name} is unchanged.`);
      setToggleError(`Couldn't save ${item.name}. Check your connection and try again.`);
    }
  };

  // Pick up a stash deleted from its card.
  const firstFocus = useRef(true);
  const { refresh } = list;

  // Google ratings and hours for restaurants (HAN-83): fetched in the background once the list is open, at most once
  // a week per item, and shown quietly when they arrive.
  const eats = data?.category.kind === 'eats';
  useEffect(() => {
    if (!eats) return;
    let live = true;
    refreshPlaceDetails(listId).then((updated) => {
      if (live && updated) refresh();
    });
    return () => {
      live = false;
    };
  }, [eats, listId, refresh]);
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
        showShopping || showShare ? (
          <View style={styles.footer}>
            {showShopping ? (
              <Button
                title={`Shopping list · ${recipesLabel(picked.length)}`}
                size="large"
                onPress={() => router.push('/shopping-list')}
                accessibilityHint="Opens the ingredients for the recipes you picked"
              />
            ) : null}
            {showShare ? (
              <Button
                title={recipients.length ? 'Send link' : 'Share list'}
                size="large"
                variant={showShopping ? 'secondary' : 'primary'}
                loading={sharing}
                onPress={recipients.length ? sendLink : () => setShareOpen(true)}
                accessibilityHint={
                  recipients.length ? 'Opens the share sheet with a link to the list' : 'Choose who can open this list'
                }
                icon={(color) => (
                  <SymbolView
                    name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
                    tintColor={color}
                    size={20}
                    weight="semibold"
                  />
                )}
              />
            ) : null}
          </View>
        ) : null
      }>
      <Stack.Screen
        options={{
          title: data ? `${data.category.name} › ${data.name}` : '',
          headerRight: () =>
            data && !editing ? (
              <Pressable
                onPress={() => setEditing(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit list"
                accessibilityHint="Rename or delete this list"
                hitSlop={12}>
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
        <>
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
          <DeleteButton
            title="Delete this list"
            confirmTitle={`Delete ${data.name}?`}
            confirmMessage={`${data.category.name} › ${data.name}${itemsLabel(data.items.length)} will be removed. It can’t be undone.`}
            onDelete={async () => {
              await deleteList(data);
              if (router.canGoBack()) router.back();
              else router.replace('/');
            }}
          />
        </>
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
      {data && !editing && (token || shareOpen) ? (
        <SharedPanel
          listId={listId}
          token={token}
          recipients={recipients}
          ownerName={ownerName}
          onChanged={share.refresh}
          onClose={() => setShareOpen(false)}
          onNote={note}
        />
      ) : null}
      {pins.length ? <PlaceMap pins={pins} selectedId={selectedId} onPinPress={selectPin} /> : null}
      {data && tags.length ? (
        <Tags kind={data.category.kind} tags={tags} active={activeTag} total={data.items.length} onPick={pickTag} />
      ) : null}
      {data && total ? (
        <ProgressBar done={doneCount} total={total} label={progressText(data.category.kind, doneCount, total)} />
      ) : null}
      {toggleError ? (
        <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
          {toggleError}
        </ThemedText>
      ) : null}
      {data?.items.length === 0 ? <ThemedText themeColor="textSecondary">No items in this list yet.</ThemedText> : null}
      {shown.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          sources={item.link_id ? data?.sources[item.link_id]?.[item.name] : undefined}
          onChanged={refresh}
          doneLabel={doneLabel}
          onToggleDone={() => {
            setToggleError(null);
            toggleDone(item);
          }}
          onToggleFavorite={() => {
            setToggleError(null);
            toggleFavorite(item);
          }}
          selected={item.id === selectedId || (recipes && picked.includes(item.id))}
          onPress={places ? () => select(item) : undefined}
          recipe={recipes ? { picked: picked.includes(item.id), count: picked.length } : undefined}
          onLayoutY={(y) => rowY.current.set(item.id, y)}
        />
      ))}
      {places ? <DirectionsSheet item={sheetItem} city={data?.name} onClose={() => setSheetItem(null)} /> : null}
    </Screen>
  );
}

/** What a list holds, for the tag filter's status line: "3 places", "1 recipe". */
function itemNoun(kind: Kind, n: number): string {
  const noun = PLACE_KINDS.includes(kind) ? 'place' : kind === 'recipes' ? 'recipe' : 'item';
  return n === 1 ? noun : `${noun}s`;
}

const tagStatus = (count: number, total: number, kind: Kind, tag: string) =>
  `Showing ${count} of ${total} ${itemNoun(kind, total)} tagged #${tag}.`;

const itemsLabel = (n: number) => (n === 1 ? ' and its 1 item' : n ? ` and all ${n} items in it` : '');

type ItemCardProps = {
  item: ItemRow;
  sources: ItemSources | undefined;
  doneLabel: string;
  onToggleDone: () => void;
  onToggleFavorite: () => void;
  selected: boolean;
  onPress?: () => void;
  onLayoutY: (y: number) => void;
  onChanged: () => Promise<unknown> | void;
  /** Recipe cards (HAN-74): whether it's on the shopping list, and how many recipes are. */
  recipe?: { picked: boolean; count: number };
};

/** The check sits beside the tappable body rather than inside it, so each is its own VoiceOver/TalkBack element. */
function ItemCard({
  item,
  sources,
  doneLabel,
  onToggleDone,
  onToggleFavorite,
  selected,
  onPress,
  onLayoutY,
  onChanged,
  recipe,
}: ItemCardProps) {
  const theme = useTheme();
  // Edit, report and delete (HAN-40).
  const [mode, setMode] = useState<'view' | 'edit' | 'report'>('view');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const provenance = provenanceOf(item, sources);

  const finish = async (message: string | null) => {
    setMode('view');
    setNotice(message);
    if (message) announce(message);
    await onChanged();
  };

  async function remove() {
    if (!(await confirmDestructive(`Delete “${item.name}”?`, 'This removes it from your list. It can’t be undone.', 'Delete'))) return;
    setError(null);
    try {
      await deleteItem(item.id);
      announce(`${item.name} deleted`);
      await onChanged();
    } catch (e) {
      const message = `Couldn’t delete: ${(e as Error).message}`;
      setError(message);
      announce(message);
    }
  }

  const toggle = () => {
    if (!recipe) return;
    toggleRecipe(item.id);
    const count = recipe.picked ? recipe.count - 1 : recipe.count + 1;
    announce(`${recipe.picked ? 'Removed from' : 'Added to'} shopping list. ${recipesLabel(count)}.`);
  };
  if (mode === 'edit') return <ItemEditForm item={item} onDone={(saved) => finish(saved ? 'Saved.' : null)} />;
  if (mode === 'report')
    return <ReportItemForm item={item} onDone={(r) => finish(r === 'sent' ? 'Report sent. Thanks.' : null)} />;

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
      <View style={styles.top}>
        <DoneCheck checked={!!item.done_at} label={`${doneLabel}, ${item.name}`} onToggle={onToggleDone} />
        <View style={styles.body}>
          <Pressable
            onPress={onPress}
            disabled={!onPress}
            accessible={!!onPress}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityHint={onPress ? 'Get directions' : undefined}
            accessibilityState={onPress ? { selected } : undefined}
            style={({ pressed }) => [styles.main, { opacity: pressed && onPress ? 0.8 : 1 }]}>
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
          <PlaceFacts item={item} />
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
        </View>
        <FavoriteStar favorite={!!item.favorited_at} name={item.name} onToggle={onToggleFavorite} />
      </View>
      {recipe ? (
        <CheckRow checked={recipe.picked} onPress={toggle} accessibilityLabel={`Add ${item.name} to shopping list`}>
          <ThemedText type="smallBold">{recipe.picked ? 'On shopping list' : 'Shopping list'}</ThemedText>
        </CheckRow>
      ) : null}
      {/* Across the full card so they fit on one line on a phone; they wrap at large text sizes (HAN-123). */}
      <View style={styles.chiclets}>
        {recipe ? (
          <Chiclet
            label="Recipe"
            onPress={() => router.push({ pathname: '/recipe/[itemId]', params: { itemId: item.id } })}
            accessibilityLabel={`Recipe for ${item.name}`}
            accessibilityHint="Ingredients and steps"
          />
        ) : null}
        <Chiclet
          label="Notes"
          onPress={() => router.push({ pathname: '/item/[itemId]', params: { itemId: item.id } })}
          accessibilityLabel={`Notes and photos for ${item.name}`}
        />
        {item.link_id ? (
          <Chiclet
            label="Post"
            onPress={() => router.push({ pathname: '/card/[linkId]', params: { linkId: item.link_id! } })}
            accessibilityLabel={`Source post for ${item.name}`}
          />
        ) : null}
        <Chiclet
          icon={{ ios: 'pencil', android: 'edit', web: 'edit' }}
          onPress={() => setMode('edit')}
          accessibilityLabel={`Edit ${item.name}`}
        />
        <Chiclet
          icon={{ ios: 'flag', android: 'flag', web: 'flag' }}
          onPress={() => setMode('report')}
          accessibilityLabel={`Report ${item.name} as wrong`}
        />
        <Chiclet
          icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
          color={theme.danger}
          onPress={remove}
          accessibilityLabel={`Delete ${item.name}`}
        />
      </View>
      {notice ? (
        <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
          {notice}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

type SharedPanelProps = {
  listId: string;
  /** Null until the first person is added. */
  token: string | null;
  recipients: string[];
  /** The owner's display name; friends see it instead of their email. Null until they set one. */
  ownerName: string | null;
  onChanged: () => Promise<void>;
  onClose: () => void;
  onNote: (text: string, error?: boolean) => void;
};

/**
 * Who the list is shared with (HAN-68): add a friend by the email of their Stashtag account, remove them, copy the
 * link, or stop sharing. The link opens only for the people listed here.
 */
function SharedPanel({ listId, token, recipients, ownerName, onChanged, onClose, onNote }: SharedPanelProps) {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  async function add() {
    if (!email.trim() || !ownerName) return;
    setAdding(true);
    setAddError(null);
    try {
      const added = await addShareRecipient(token ?? (await shareList(listId)), email);
      setEmail('');
      await onChanged();
      onNote(`Added ${added}. Send them the link; it opens when they sign in with that email.`);
    } catch (e) {
      const message = (e as Error).message;
      setAddError(message);
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setAdding(false);
    }
  }

  async function remove(who: string) {
    if (!token) return;
    setRemoving(who);
    try {
      await removeShareRecipient(token, who);
      await onChanged();
      onNote(`Removed ${who}. The link no longer opens for them.`);
    } catch (e) {
      onNote(`Couldn’t remove ${who}: ${(e as Error).message}`, true);
    } finally {
      setRemoving(null);
    }
  }

  async function stop() {
    const ok = await confirmDestructive(
      'Stop sharing this list?',
      'The link stops working for everyone you shared it with. Lists friends already added stay in their stash.',
      'Stop sharing',
    );
    if (!ok) return;
    setStopping(true);
    try {
      await stopSharingList(listId);
      await onChanged();
      onClose();
      onNote('Stopped sharing. The link no longer works.');
    } catch (e) {
      onNote(`Couldn’t stop sharing: ${(e as Error).message}`, true);
    } finally {
      setStopping(false);
    }
  }

  return (
    <View style={[styles.shared, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="defaultBold" accessibilityRole="header">
        Share with
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Add the email your friend uses for Stashtag. The link opens only for the people listed here, once they sign in.
        Your other lists stay private.
      </ThemedText>
      {ownerName ? (
        <ThemedText type="small" themeColor="textSecondary">
          They see it as shared by {ownerName}. You can change your name in Profile.
        </ThemedText>
      ) : (
        <>
          <ThemedText type="smallBold">First, your name</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Friends see this name on the list, not your email.
          </ThemedText>
          <DisplayNameForm name={null} onSaved={() => onChanged()} />
        </>
      )}
      <TextField
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setAddError(null);
        }}
        onSubmitEditing={add}
        placeholder="friend@example.com"
        accessibilityLabel="Friend’s email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="done"
        maxLength={254}
        invalid={!!addError}
        editable={!adding && !!ownerName}
      />
      {addError ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {addError}
        </ThemedText>
      ) : null}
      <Button
        title="Add"
        loading={adding}
        disabled={!email.trim() || !ownerName}
        accessibilityHint={ownerName ? undefined : 'Save your name first'}
        onPress={add}
      />
      {recipients.length ? (
        <View accessibilityRole="list" accessibilityLabel="Shared with" style={styles.recipients}>
          {recipients.map((who) => (
            <View key={who} style={styles.recipient}>
              <ThemedText type="small" style={styles.recipientEmail}>
                {who}
              </ThemedText>
              <Button
                title="Remove"
                variant="secondary"
                accessibilityLabel={`Remove ${who}`}
                loading={removing === who}
                onPress={() => remove(who)}
              />
            </View>
          ))}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Not shared with anyone yet.
        </ThemedText>
      )}
      <View style={styles.sharedActions}>
        {token && recipients.length ? (
          <Button
            title="Copy link"
            variant="secondary"
            style={styles.sharedAction}
            onPress={async () => {
              await Clipboard.setStringAsync(shareUrl(token));
              onNote('Link copied.');
            }}
          />
        ) : null}
        {token ? (
          <Button title="Stop sharing" variant="secondary" style={styles.sharedAction} loading={stopping} onPress={stop} />
        ) : (
          <Button title="Cancel" variant="secondary" style={styles.sharedAction} onPress={onClose} />
        )}
      </View>
    </View>
  );
}

type TagsProps = {
  kind: Kind;
  tags: { tag: string; count: number }[];
  active: string | null;
  total: number;
  onPick: (tag: string | null) => void;
};

/** The list's #tags as toggles (HAN-79): one at a time; tapping the picked one, or Show all, clears it. */
function Tags({ kind, tags, active, total, onPick }: TagsProps) {
  const theme = useTheme();
  const activeCount = tags.find((t) => t.tag === active)?.count ?? 0;
  return (
    <View style={styles.tagFilter}>
      <View style={styles.tags} accessibilityRole="toolbar" accessibilityLabel="Filter by tag">
        {tags.map(({ tag, count }) => (
          <TagChip
            key={tag}
            kind={kind}
            tag={tag}
            selected={tag === active}
            onPress={() => onPick(tag === active ? null : tag)}
            accessibilityLabel={`#${tag}, ${count} ${itemNoun(kind, count)}`}
            accessibilityHint={
              tag === active ? 'Shows everything in the list again' : `Shows only ${itemNoun(kind, 2)} tagged ${tag}`
            }
          />
        ))}
      </View>
      {active ? (
        <View style={styles.tagStatus}>
          <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite" style={styles.grow}>
            {tagStatus(activeCount, total, kind, active)}
          </ThemedText>
          <Pressable onPress={() => onPick(null)} accessibilityRole="button" style={styles.link}>
            <ThemedText type="smallBold" style={{ color: theme.link }}>
              Show all
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // 12 at the sides (not 16) so the chiclet row fits on one line on a 393pt-wide iPhone 15 Pro (HAN-123).
    paddingVertical: Spacing.three,
    paddingHorizontal: 12,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: Spacing.two,
  },
  top: { flexDirection: 'row', gap: Spacing.three },
  body: { flex: 1, gap: Spacing.one },
  // Rows sit 16 apart when they wrap so each chiclet's 48pt hit area doesn't overlap the next row's.
  chiclets: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.one, rowGap: Spacing.three },
  main: { gap: Spacing.one },
  footer: { gap: Spacing.two },
  link: { minHeight: 44, justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: Radius.row, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  tagFilter: { gap: Spacing.one },
  // Rows sit 16 apart so each chip's 44pt hit area doesn't overlap the next row's.
  tags: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.two, rowGap: Spacing.three },
  // The status and Show all side by side; Show all wraps below at large text sizes.
  tagStatus: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Spacing.three },
  grow: { flexShrink: 1 },
  shared: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.two },
  // Side by side when they fit; stacked at large text sizes.
  sharedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  sharedAction: { flexGrow: 1 },
  recipients: { gap: Spacing.two },
  // Email and its Remove button side by side; the button wraps below at large text sizes.
  recipient: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  recipientEmail: { flexGrow: 1, flexShrink: 1, minWidth: 160 },
});
