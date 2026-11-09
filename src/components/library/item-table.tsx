import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { KindIcon } from '@/components/kind-icon';
import { TagChip } from '@/components/tag-chip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useKindColors, useTheme } from '@/hooks/use-theme';
import type { LibraryItem } from '@/lib/data';
import type { ClickModifiers } from '@/lib/selection';

import { Draggable } from './drag';

type Props = {
  items: LibraryItem[];
  selected: ReadonlySet<string>;
  activeId: string | null;
  /** Wide enough for the Tags and Added columns. */
  wide: boolean;
  onRowPress: (item: LibraryItem, modifiers: ClickModifiers) => void;
  onToggle: (item: LibraryItem) => void;
  onToggleAll: () => void;
  /** Ids a drag starting on this row carries. */
  dragIds: (item: LibraryItem) => string[];
};

const plural = (n: number) => `${n} save${n === 1 ? '' : 's'}`;
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** The saves in the current scope as a table: checkbox, name and description, list, tags, date added. */
export function ItemTable({ items, selected, activeId, wide, onRowPress, onToggle, onToggleAll, dragIds }: Props) {
  const theme = useTheme();
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  return (
    <View accessibilityRole="list">
      <View style={[styles.row, styles.headerRow, { borderColor: theme.border }]}>
        <Checkbox checked={allSelected} onPress={onToggleAll} label={allSelected ? 'Clear selection' : 'Select all'} />
        <HeaderCell style={styles.name}>Name</HeaderCell>
        <HeaderCell style={styles.list}>List</HeaderCell>
        {wide ? <HeaderCell style={styles.tags}>Tags</HeaderCell> : null}
        {wide ? <HeaderCell style={styles.date}>Added</HeaderCell> : null}
      </View>
      {items.map((item) => (
        <Draggable key={item.id} getItemIds={() => dragIds(item)} label={plural}>
          <ItemRowView
            item={item}
            wide={wide}
            checked={selected.has(item.id)}
            active={item.id === activeId}
            onPress={(modifiers) => onRowPress(item, modifiers)}
            onToggle={() => onToggle(item)}
          />
        </Draggable>
      ))}
    </View>
  );
}

function ItemRowView({
  item,
  wide,
  checked,
  active,
  onPress,
  onToggle,
}: {
  item: LibraryItem;
  wide: boolean;
  checked: boolean;
  active: boolean;
  onPress: (modifiers: ClickModifiers) => void;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const kind = item.list.category.kind;
  const k = useKindColors()[kind];
  const tags = [...item.tags, ...item.list.tags].map((t) => t.replace(/^#+/, '')).filter((t, i, all) => all.indexOf(t) === i);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, checked }}
      accessibilityLabel={item.name}
      onPress={(event) => onPress(modifiersOf(event))}
      style={({ pressed }) => [
        styles.row,
        { borderColor: theme.border },
        checked && { backgroundColor: theme.backgroundSelected },
        (active || pressed) && { backgroundColor: theme.backgroundSelected },
        active && { borderLeftColor: theme.tint },
      ]}>
      <Checkbox checked={checked} onPress={onToggle} label={`Select ${item.name}`} />
      <View style={[styles.name, styles.nameCell]}>
        <View style={[styles.thumb, { backgroundColor: k.color }]}>
          <KindIcon kind={kind} color={k.onColor} size={16} />
        </View>
        <View style={styles.nameText}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {item.name}
          </ThemedText>
          {item.description ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {item.description}
            </ThemedText>
          ) : null}
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.list}>
        {item.list.category.name} › {item.list.name}
      </ThemedText>
      {wide ? (
        <View style={[styles.tags, styles.tagCell]}>
          {tags.slice(0, 2).map((tag) => (
            <TagChip key={tag} kind={kind} tag={tag} />
          ))}
        </View>
      ) : null}
      {wide ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.date}>
          {dateFormat.format(new Date(item.created_at))}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

/** On web, onPress receives the DOM click, which carries the modifier keys. */
function modifiersOf(event: GestureResponderEvent): ClickModifiers {
  const native = event.nativeEvent as unknown as { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean };
  return { toggle: !!(native.metaKey || native.ctrlKey), range: !!native.shiftKey };
}

export function Checkbox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={8}
      onPress={(event) => {
        // Don't let the row underneath treat this as a click on itself.
        event.stopPropagation();
        onPress();
      }}
      style={[
        styles.checkbox,
        { borderColor: checked ? theme.tint : theme.textSecondary, backgroundColor: checked ? theme.tint : 'transparent' },
      ]}>
      {checked ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor={theme.onTint} size={14} weight="bold" /> : null}
    </Pressable>
  );
}

function HeaderCell({ children, style }: { children: string; style: object }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={style}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  headerRow: { minHeight: 40 },
  name: { flex: 3, minWidth: 0 },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  nameText: { flex: 1, minWidth: 0 },
  thumb: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 2, minWidth: 0 },
  tags: { flex: 2, minWidth: 0 },
  tagCell: { flexDirection: 'row', gap: Spacing.one, overflow: 'hidden' },
  date: { width: 64, textAlign: 'right' },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
