import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { KindCategory } from '@/lib/data';
import { KIND_LABELS } from '@/lib/types';

type Props = {
  count: number;
  library: KindCategory[];
  onPick: (listId: string) => void;
  onClose: () => void;
};

/** Pick the list to move saves to, with a filter box (it gets focus, so typing narrows straight away). */
export function MoveMenu({ count, library, onPick, onClose }: Props) {
  const theme = useTheme();
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const matches = library
    .map((category) => ({
      ...category,
      lists: category.lists.filter((list) =>
        `${KIND_LABELS[category.kind]} ${category.name} ${list.name}`.toLowerCase().includes(q),
      ),
    }))
    .filter((category) => category.lists.length);
  const first = matches[0]?.lists[0];

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View
        accessibilityViewIsModal
        style={[styles.sheet, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText type="defaultBold">
          Move {count} save{count === 1 ? '' : 's'} to…
        </ThemedText>
        <TextField
          value={filter}
          onChangeText={setFilter}
          placeholder="Find a list"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => first && onPick(first.id)}
          accessibilityLabel="Find a list"
        />
        <ScrollView style={styles.lists} contentContainerStyle={styles.listsContent}>
          {matches.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No list matches “{filter.trim()}”.
            </ThemedText>
          ) : null}
          {matches.map((category) => (
            <View key={category.id} style={styles.group}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {KIND_LABELS[category.kind]} › {category.name}
              </ThemedText>
              {category.lists.map((list) => (
                <Pressable
                  key={list.id}
                  accessibilityRole="button"
                  onPress={() => onPick(list.id)}
                  style={({ pressed }) => [
                    styles.option,
                    (pressed || list.id === first?.id) && { backgroundColor: theme.backgroundSelected },
                  ]}>
                  <ThemedText type="small" numberOfLines={1} style={styles.optionLabel}>
                    {list.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {list.itemCount}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
        <Button title="Cancel" variant="secondary" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(10, 20, 32, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    width: 420,
    maxHeight: '80%',
    padding: Spacing.four,
    gap: Spacing.three,
    borderRadius: Radius.tile,
    borderWidth: 1,
  },
  lists: { flexGrow: 0 },
  listsContent: { gap: Spacing.three },
  group: { gap: Spacing.half },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 36,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.row / 2,
  },
  optionLabel: { flex: 1 },
});
