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
import { deleteLink, primaryTag, type InFlightLink, type StashItem } from '@/lib/data';
import { captionSnippet, needsTextReason, shortUrl } from '@/lib/link-summary';
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
 * A link that isn't filed yet: being sorted ("processing") or waiting for what the post says ("pending"). A waiting
 * row names the post (caption line, else its URL) and why it's waiting, with buttons to open the post or remove it
 * (HAN-32), so it still makes sense after leaving the app.
 */
export function PendingLinkRow({ link, onRemoved }: { link: InFlightLink; onRemoved: () => void }) {
  const theme = useTheme();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const platform = PLATFORM_LABELS[link.platform];
  const post = captionSnippet(link.caption) ?? shortUrl(link.url);

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

  // A request still on its way is "pending" without an error; only a finished read gives a reason.
  const reason = link.error === 'needs_capture' ? needsTextReason(link.fetch_reason) : 'Add what the post says';

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
        accessibilityLabel={`${post}, from ${platform}. ${reason}.`}
        accessibilityHint="Add what the post says"
        onPress={() => router.push({ pathname: '/capture/[linkId]', params: { linkId: link.id } })}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={[styles.thumb, { backgroundColor: theme.backgroundSelected }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SymbolView name={{ ios: 'square.and.pencil', android: 'edit', web: 'edit' }} tintColor={theme.textSecondary} size={24} />
        </View>
        <View style={styles.text}>
          <ThemedText type="defaultBold" numberOfLines={2}>
            {post}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {platform} · {reason}
          </ThemedText>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Button title={`Open in ${platform}`} variant="secondary" onPress={() => Linking.openURL(link.url)} style={styles.action} />
        <Button title="Remove" variant="secondary" onPress={remove} loading={removing} style={styles.action} />
      </View>
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
    </View>
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
