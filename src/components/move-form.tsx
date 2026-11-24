import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, findNodeHandle, Pressable, StyleSheet, View, type ViewInstance } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { fetchKind, moveItems } from '@/lib/data';
import { moveSummary } from '@/lib/move-summary';
import type { Kind } from '@/lib/types';

/**
 * Move items to another category and list (HAN-124), chosen from the ones the user already has under the same kind:
 * nothing is typed, so a misspelling can't make a new category and an existing name can't conflict. `onMoved` gets the
 * list they went to and a summary to show.
 */
export function MoveForm({
  kind,
  fromListId,
  itemIds,
  title,
  warning,
  onMoved,
  onCancel,
}: {
  kind: Kind;
  fromListId: string;
  itemIds: string[];
  title: string;
  /** Shown under the title, e.g. that moving a shared list's items stops its link working. */
  warning?: string;
  onMoved: (listId: string, summary: string) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const categories = useAsync(() => fetchKind(kind), [kind]);
  const all = categories.data ?? [];
  const current = all.find((c) => c.lists.some((l) => l.id === fromListId));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [listId, setListId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = all.find((c) => c.id === (categoryId ?? current?.id));
  const lists = category?.lists ?? [];
  const list = lists.find((l) => l.id === (listId ?? (category === current ? fromListId : undefined)));
  const unchanged = !list || list.id === fromListId;

  async function save() {
    if (!list || !category || unchanged) return;
    setSaving(true);
    setError(null);
    try {
      const summary = moveSummary(`${category.name} › ${list.name}`, await moveItems(itemIds, list.id));
      announce(summary);
      onMoved(list.id, summary);
    } catch (e) {
      const text = `Couldn’t move: ${(e as Error).message}`;
      setError(text);
      announce(text);
      setSaving(false);
    }
  }

  return (
    <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="defaultBold" accessibilityRole="header">
        {title}
      </ThemedText>
      {warning ? (
        <ThemedText type="small" themeColor="textSecondary">
          {warning}
        </ThemedText>
      ) : null}
      {categories.error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {categories.error.message}
        </ThemedText>
      ) : null}
      {categories.loading && !categories.data ? <ActivityIndicator accessibilityLabel="Loading your categories" /> : null}
      {categories.data ? (
        <>
          <Dropdown
            label="Category"
            value={category?.name ?? null}
            selectedId={category?.id ?? null}
            options={all.map((c) => ({ id: c.id, name: c.name }))}
            onChange={(id) => {
              setCategoryId(id);
              // A category with one list has nothing to choose; otherwise make them pick.
              const next = all.find((c) => c.id === id);
              setListId(next?.lists.length === 1 ? next.lists[0].id : null);
              setError(null);
            }}
          />
          <Dropdown
            label="List"
            value={list?.name ?? null}
            selectedId={list?.id ?? null}
            options={lists.map((l) => ({ id: l.id, name: l.name }))}
            onChange={(id) => {
              setListId(id);
              setError(null);
            }}
          />
        </>
      ) : null}
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={saving} style={styles.flex} />
        <Button title="Move" onPress={save} loading={saving} disabled={unchanged} style={styles.flex} />
      </View>
    </View>
  );
}

/**
 * A field that opens to a radio list of choices. Read out as "Category, Restaurants, button, collapsed"; choosing
 * closes it and puts VoiceOver/TalkBack focus back on the field.
 */
function Dropdown({
  label,
  value,
  selectedId,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  selectedId: string | null;
  options: { id: string; name: string }[];
  onChange: (id: string) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const field = useRef<ViewInstance>(null);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    // The pressed option disappears; without this, screen reader focus is lost.
    setTimeout(() => {
      const node = findNodeHandle(field.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 100);
  }

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary" importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </ThemedText>
      <Pressable
        ref={field}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ?? 'not chosen'}`}
        accessibilityHint={open ? `Hides the ${label.toLowerCase()} choices` : `Shows your ${label.toLowerCase()} choices`}
        accessibilityState={{ expanded: open }}
        style={[styles.select, { borderColor: theme.inputBorder, backgroundColor: theme.backgroundElement }]}>
        <ThemedText themeColor={value ? 'text' : 'textSecondary'} style={styles.flex}>
          {value ?? `Choose a ${label.toLowerCase()}`}
        </ThemedText>
        <SymbolView
          name={{ ios: open ? 'chevron.up' : 'chevron.down', android: open ? 'expand_less' : 'expand_more', web: open ? 'expand_less' : 'expand_more' }}
          tintColor={theme.textSecondary}
          size={18}
          weight="semibold"
          importantForAccessibility="no"
          accessibilityElementsHidden
        />
      </Pressable>
      {open ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.options}>
          {options.map((o) => {
            const selected = o.id === selectedId;
            return (
              <Pressable
                key={o.id}
                onPress={() => choose(o.id)}
                accessibilityRole="radio"
                accessibilityLabel={o.name}
                accessibilityState={{ selected, checked: selected }}
                style={styles.option}>
                <View style={[styles.radio, { borderColor: selected ? theme.tint : theme.textSecondary }]}>
                  {selected ? <View style={[styles.radioDot, { backgroundColor: theme.tint }]} /> : null}
                </View>
                <ThemedText type={selected ? 'defaultBold' : 'default'} style={styles.flex}>
                  {o.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.three },
  field: { gap: Spacing.one },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.row,
    borderWidth: 1,
  },
  options: { gap: Spacing.half, paddingLeft: Spacing.one },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
