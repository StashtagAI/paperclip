import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { KindIcon } from '@/components/kind-icon';
import { TagChip } from '@/components/tag-chip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useKindColors, useTheme } from '@/hooks/use-theme';
import type { LibraryItem } from '@/lib/data';
import { KIND_LABELS, PLATFORM_LABELS } from '@/lib/types';

type Props = {
  item: LibraryItem | null;
  /** How many rows are checked, shown when no single save is open. */
  selectedCount: number;
  width: number;
  onOpenList: (listId: string) => void;
  onMove: () => void;
  onDelete: () => void;
};

/** The open save: what it is, where it's filed, where it came from, and actions on it. */
export function DetailPane({ item, selectedCount, width, onOpenList, onMove, onDelete }: Props) {
  const theme = useTheme();
  const kindColors = useKindColors();
  return (
    <View style={[styles.pane, { width, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      {item ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.kind}>
            <KindIcon kind={item.list.category.kind} color={kindColors[item.list.category.kind].color} size={18} />
            <ThemedText type="smallBold" themeColor="textSecondary">
              {KIND_LABELS[item.list.category.kind]}
            </ThemedText>
          </View>
          <ThemedText type="sectionTitle" selectable>
            {item.name}
          </ThemedText>
          {item.description ? <ThemedText selectable>{item.description}</ThemedText> : null}

          <Field label="List">
            <ThemedText type="link" themeColor="tint" onPress={() => onOpenList(item.list.id)}>
              {item.list.category.name} › {item.list.name}
            </ThemedText>
          </Field>

          {item.address ? (
            <Field label="Address">
              <ThemedText type="small" selectable>
                {item.address}
              </ThemedText>
              <ThemedText type="link" themeColor="tint" onPress={() => Linking.openURL(mapsUrl(item))}>
                Open in Maps
              </ThemedText>
            </Field>
          ) : null}

          {item.tags.length ? (
            <Field label="Tags">
              <View style={styles.tags}>
                {item.tags.map((tag) => (
                  <TagChip key={tag} kind={item.list.category.kind} tag={tag.replace(/^#+/, '')} />
                ))}
              </View>
            </Field>
          ) : null}

          {item.link ? (
            <Field label="Source">
              <ThemedText type="link" themeColor="tint" onPress={() => item.link && Linking.openURL(item.link.url)}>
                Open on {PLATFORM_LABELS[item.link.platform]}
              </ThemedText>
              <ThemedText
                type="link"
                themeColor="tint"
                onPress={() => item.link && router.push({ pathname: '/card/[linkId]', params: { linkId: item.link.id } })}>
                Everything from this post
              </ThemedText>
            </Field>
          ) : null}

          <View style={styles.actions}>
            <Button title="Move to…" variant="secondary" onPress={onMove} style={styles.action} />
            <Button title="Delete" variant="secondary" onPress={onDelete} style={styles.action} />
          </View>
        </ScrollView>
      ) : (
        <View style={styles.empty}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {selectedCount
              ? `${selectedCount} selected. Drag them onto a list, or use Move to… above.`
              : 'Select a save to see its details.'}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

function mapsUrl(item: LibraryItem) {
  const query = item.lat !== null && item.lng !== null ? `${item.lat},${item.lng}` : `${item.name}, ${item.address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

const styles = StyleSheet.create({
  pane: { borderLeftWidth: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  kind: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  field: { gap: Spacing.one },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  action: { flex: 1, paddingHorizontal: Spacing.two },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  center: { textAlign: 'center' },
});
