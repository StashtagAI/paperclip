import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { KindIcon } from '@/components/kind-icon';
import { TagChip } from '@/components/tag-chip';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useKindColors, useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { deleteLink, dismissLink, primaryTag, type InFlightLink, type StashItem } from '@/lib/data';
import { announce } from '@/lib/announce';
import { FAILED_TITLE, failureReason, linkStatusLabel, NOT_SORTED_REASON, NOT_SORTED_TITLE, retryAction } from '@/lib/link-outcome';
import { needsTextReason, postName, shortUrl } from '@/lib/link-summary';
import { KIND_LABELS, PLATFORM_LABELS } from '@/lib/types';

/** A "Recently stashed" row: kind-coloured thumbnail, title, "Kind · from Instagram", #tag. */
export function StashRow({ item }: { item: StashItem }) {
  const kind = item.list.category.kind;
  const k = useKindColors()[kind];
  const tag = primaryTag(item);
  const source = item.link ? ` · from ${PLATFORM_LABELS[item.link.platform]}` : '';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/list/[listId]', params: { listId: item.list.id } })}
      accessibilityRole="button"
      style={({ pressed }) => pressed && styles.pressed}>
      <RowFrame
        thumb={
          <View style={[styles.thumb, { backgroundColor: k.color }]}>
            <KindIcon kind={kind} color={k.onColor} size={24} />
          </View>
        }
        title={item.name}
        subtitle={`${KIND_LABELS[kind]}${source}`}
        trailing={tag ? <TagChip kind={kind} tag={tag} /> : null}
      />
    </Pressable>
  );
}

/**
 * A link that isn't filed yet: being sorted ("processing"), waiting for what the post says ("pending"), failed, or done
 * with nothing filed ("not sorted"). A waiting row names the post (caption line, else its URL) and why it's waiting,
 * with buttons to open the post or remove it (HAN-32), so it still makes sense after leaving the app. A failed row says
 * why, with Try again and Remove (HAN-77). A not-sorted row offers Choose a category and Dismiss (HAN-89).
 */
export function PendingLinkRow({ link, onRemoved }: { link: InFlightLink; onRemoved: () => void }) {
  const theme = useTheme();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const platform = PLATFORM_LABELS[link.platform];
  const post = postName(link);

  if (link.status === 'processing') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sorting your link: ${post}`}
        onPress={() => router.push({ pathname: '/card/[linkId]', params: { linkId: link.id } })}
        style={({ pressed }) => pressed && styles.pressed}>
        <RowFrame
          thumb={
            <View style={[styles.thumb, { backgroundColor: theme.backgroundSelected }]}>
              <ActivityIndicator color={theme.tint} />
            </View>
          }
          title="Sorting your link…"
          subtitle={`${post} · ${platform}`}
        />
      </Pressable>
    );
  }

  if (link.not_sorted) return <NotSortedRow link={link} onRemoved={onRemoved} />;

  const failed = link.status === 'failed';
  const retry = failed ? retryAction(link.status, link.error) : null;
  // A request still on its way is "pending" without an error; only a finished read gives a reason.
  const reason = failed
    ? failureReason(link.error)
    : link.error === 'needs_capture'
      ? needsTextReason(link.fetch_reason)
      : 'Add what the post says';
  const openCard = () => router.push({ pathname: '/card/[linkId]', params: { linkId: link.id } });
  const openCapture = () => router.push({ pathname: '/capture/[linkId]', params: { linkId: link.id } });

  async function remove() {
    if (!(await confirmDestructive('Remove this link?', `${post} will be removed from your stash.`, 'Remove'))) return;
    setRemoving(true);
    setError(null);
    try {
      await deleteLink(link.id);
      AccessibilityInfo.announceForAccessibility('Link removed');
      onRemoved();
    } catch (e) {
      setError(`Couldn’t remove: ${(e as Error).message}`);
      setRemoving(false);
    }
  }

  return (
    <View style={[styles.frame, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={failed ? `${post}, from ${platform}. ${FAILED_TITLE}. ${reason}` : `${post}, from ${platform}. ${reason}.`}
        accessibilityHint={failed ? 'Opens the card' : 'Add what the post says'}
        onPress={failed ? openCard : openCapture}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={[styles.thumb, { backgroundColor: theme.backgroundSelected }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {failed ? (
            <SymbolView
              name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
              tintColor={theme.danger}
              size={24}
            />
          ) : (
            <SymbolView name={{ ios: 'square.and.pencil', android: 'edit', web: 'edit' }} tintColor={theme.textSecondary} size={24} />
          )}
        </View>
        <View style={styles.text}>
          {failed ? (
            <ThemedText type="smallBold" themeColor="danger">
              {FAILED_TITLE}
            </ThemedText>
          ) : null}
          <ThemedText type="defaultBold" numberOfLines={2}>
            {post}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {platform} · {reason}
          </ThemedText>
        </View>
      </Pressable>
      <View style={styles.actions}>
        {retry === 'upgrade' ? (
          <Button title="See Premium" accessibilityLabel={`See Premium: ${post}`} onPress={() => router.push('/premium')} style={styles.action} />
        ) : retry ? (
          <Button
            title={retry === 'rerun' ? 'Try again' : 'Add text'}
            accessibilityLabel={retry === 'rerun' ? `Try again: ${post}` : `Add what the post says: ${post}`}
            onPress={() =>
              retry === 'rerun'
                ? router.push({ pathname: '/card/[linkId]', params: { linkId: link.id, retry: '1' } })
                : openCapture()
            }
            style={styles.action}
          />
        ) : (
          <Button title={`Open in ${platform}`} variant="secondary" onPress={() => Linking.openURL(link.url)} style={styles.action} />
        )}
        <Button
          title="Remove"
          accessibilityLabel={`Remove: ${post}`}
          variant="secondary"
          onPress={remove}
          loading={removing}
          style={styles.action}
        />
      </View>
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Done with nothing filed (HAN-89): stays on Home until it's filed from its card or dismissed here. */
function NotSortedRow({ link, onRemoved }: { link: InFlightLink; onRemoved: () => void }) {
  const theme = useTheme();
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const platform = PLATFORM_LABELS[link.platform];
  const post = postName(link);
  const openCard = () => router.push({ pathname: '/card/[linkId]', params: { linkId: link.id } });

  async function dismiss() {
    setDismissing(true);
    setError(null);
    try {
      await dismissLink(link.id);
      // The row goes away, so iOS and Android both need telling; it's still under All stashes.
      AccessibilityInfo.announceForAccessibility(`Dismissed: ${post}. It’s still under All stashes.`);
      onRemoved();
    } catch (e) {
      const message = `Couldn’t dismiss: ${(e as Error).message}`;
      setError(message);
      announce(message);
      setDismissing(false);
    }
  }

  return (
    <View style={[styles.frame, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${post}, from ${platform}. ${NOT_SORTED_TITLE}. ${NOT_SORTED_REASON}.`}
        accessibilityHint="Opens the card"
        onPress={openCard}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View
          style={[styles.thumb, { backgroundColor: theme.backgroundSelected }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <SymbolView name={{ ios: 'tray', android: 'inbox', web: 'inbox' }} tintColor={theme.textSecondary} size={24} />
        </View>
        <View style={styles.text}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {NOT_SORTED_TITLE}
          </ThemedText>
          <ThemedText type="defaultBold" numberOfLines={2}>
            {post}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {platform} · {NOT_SORTED_REASON}
          </ThemedText>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Button
          title="Choose a category"
          accessibilityLabel={`Choose a category: ${post}`}
          onPress={openCard}
          style={styles.action}
        />
        <Button
          title="Dismiss"
          accessibilityLabel={`Dismiss: ${post}`}
          accessibilityHint="Takes it off Home. It stays under All stashes."
          variant="secondary"
          onPress={dismiss}
          loading={dismissing}
          style={styles.action}
        />
      </View>
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * One stash in Recent links or All stashes: which post, and its status as a word (HAN-89: "Not sorted", never "Filed",
 * when nothing was filed). Opens the card.
 */
export function LinkStatusRow({ link }: { link: InFlightLink }) {
  const theme = useTheme();
  const label = linkStatusLabel(link);
  const color = link.status === 'failed' ? theme.danger : label === 'Filed' ? theme.success : theme.textSecondary;
  const detail =
    link.status === 'failed'
      ? failureReason(link.error)
      : link.not_sorted
        ? `${NOT_SORTED_REASON}${link.dismissed_at ? ' · Dismissed' : ''}`
        : link.status === 'pending' && link.error === 'needs_capture'
          ? needsTextReason(link.fetch_reason)
          : null;
  const post = postName(link);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[post, label, detail].filter(Boolean).join('. ')}
      accessibilityHint="Opens the card"
      onPress={() => router.push({ pathname: '/card/[linkId]', params: { linkId: link.id } })}
      style={({ pressed }) => [
        styles.frame,
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <View style={styles.text}>
        <ThemedText type="small" numberOfLines={2}>
          {post}
        </ThemedText>
        {post !== shortUrl(link.url) ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {shortUrl(link.url)}
          </ThemedText>
        ) : null}
        {detail ? (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function RowFrame({ thumb, title, subtitle, trailing }: { thumb: ReactNode; title: string; subtitle: string; trailing?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.frame, styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {thumb}
      <View style={styles.text}>
        <ThemedText type="defaultBold" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {subtitle}
        </ThemedText>
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4 },
  thumb: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  action: { flexGrow: 1, paddingHorizontal: Spacing.three },
  pressed: { opacity: 0.7 },
});
