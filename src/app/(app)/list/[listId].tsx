import * as Clipboard from 'expo-clipboard';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { Button } from '@/components/button';
import { CheckRow } from '@/components/check-row';
import { DeleteButton } from '@/components/delete-button';
import { DirectionsSheet } from '@/components/directions-sheet';
import { DisplayNameForm } from '@/components/display-name-form';
import { PlaceMap } from '@/components/place-map';
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
  deleteList,
  fetchDisplayName,
  fetchList,
  fetchListShare,
  fetchShareRecipients,
  NAME_LIMITS,
  removeShareRecipient,
  renameCategory,
  renameList,
  shareList,
  stopSharingList,
} from '@/lib/data';
import { hasCoords } from '@/lib/geo';
import { openShareSheet, shareMessage, shareUrl } from '@/lib/share';
import { recipesLabel } from '@/lib/shopping-list';
import { toggleRecipe, useShoppingSelection } from '@/lib/shopping-selection';
import type { ItemRow, Kind } from '@/lib/types';

/** Kinds whose items are places: their lists get a map and directions (HAN-24). */
const PLACE_KINDS: readonly Kind[] = ['eats', 'trips'];

/** Level 3: the items in one list, e.g. Restaurants > Denver. */
export default function ListScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const list = useAsync(() => fetchList(listId), [listId]);
  const data = list.data;
  const places = !!data && PLACE_KINDS.includes(data.category.kind);
  const recipes = data?.category.kind === 'recipes';
  const picked = useShoppingSelection().ids;
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
      {data?.tags.length ? <Tags kind={data.category.kind} tags={data.tags} /> : null}
      {data?.items.length === 0 ? <ThemedText themeColor="textSecondary">No items in this list yet.</ThemedText> : null}
      {data?.items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
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

const itemsLabel = (n: number) => (n === 1 ? ' and its 1 item' : n ? ` and all ${n} items in it` : '');

type ItemCardProps = {
  item: ItemRow;
  selected: boolean;
  onPress?: () => void;
  onLayoutY: (y: number) => void;
  /** Recipe cards (HAN-74): whether it's on the shopping list, and how many recipes are. */
  recipe?: { picked: boolean; count: number };
};

function ItemCard({ item, selected, onPress, onLayoutY, recipe }: ItemCardProps) {
  const theme = useTheme();
  const toggle = () => {
    if (!recipe) return;
    toggleRecipe(item.id);
    const count = recipe.picked ? recipe.count - 1 : recipe.count + 1;
    announce(`${recipe.picked ? 'Removed from' : 'Added to'} shopping list. ${recipesLabel(count)}.`);
  };
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
        {recipe ? (
          <Pressable
            onPress={() => router.push({ pathname: '/recipe/[itemId]', params: { itemId: item.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Recipe for ${item.name}`}
            accessibilityHint="Ingredients and steps"
            style={styles.link}>
            <ThemedText type="small" style={{ color: theme.link }}>
              Recipe ›
            </ThemedText>
          </Pressable>
        ) : null}
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
      {recipe ? (
        <CheckRow checked={recipe.picked} onPress={toggle} accessibilityLabel={`Add ${item.name} to shopping list`}>
          <ThemedText type="smallBold">{recipe.picked ? 'On shopping list' : 'Shopping list'}</ThemedText>
        </CheckRow>
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
  footer: { gap: Spacing.two },
  link: { minHeight: 44, justifyContent: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  shared: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.two },
  // Side by side when they fit; stacked at large text sizes.
  sharedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  sharedAction: { flexGrow: 1 },
  recipients: { gap: Spacing.two },
  // Email and its Remove button side by side; the button wraps below at large text sizes.
  recipient: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  recipientEmail: { flexGrow: 1, flexShrink: 1, minWidth: 160 },
});
