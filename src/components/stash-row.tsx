import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { KindIcon } from '@/components/kind-icon';
import { TagChip } from '@/components/tag-chip';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useKindColors, useTheme } from '@/hooks/use-theme';
import { primaryTag, type StashItem } from '@/lib/data';
import { KIND_LABELS, PLATFORM_LABELS, type LinkRow } from '@/lib/types';

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

/** A link that process-link hasn't sorted yet. */
export function PendingLinkRow({ link }: { link: LinkRow }) {
  const theme = useTheme();
  return (
    <RowFrame
      thumb={
        <View style={[styles.thumb, { backgroundColor: theme.backgroundSelected }]}>
          <ActivityIndicator color={theme.tint} />
        </View>
      }
      title="Sorting your link…"
      subtitle={`from ${PLATFORM_LABELS[link.platform]}`}
    />
  );
}

function RowFrame({ thumb, title, subtitle, trailing }: { thumb: ReactNode; title: string; subtitle: string; trailing?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.two + 2,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  thumb: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
});
