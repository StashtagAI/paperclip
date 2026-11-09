import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField, type TextFieldHandle } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteItems,
  fetchLibrary,
  fetchLibraryItems,
  moveItems,
  type KindCategory,
  type LibraryScope,
} from '@/lib/data';
import { actionTargets, clickSelect, toggleOne } from '@/lib/selection';
import { supabase } from '@/lib/supabase';
import { KIND_LABELS, KINDS, type Kind } from '@/lib/types';

import { confirmDestructive } from './confirm';
import { DetailPane } from './detail-pane';
import { ItemTable } from './item-table';
import { MoveMenu } from './move-menu';
import { Sidebar } from './sidebar';
import { useShortcuts } from './use-shortcuts';

/** Width at which Home switches from the phone column to this layout (web only). */
export const DESKTOP_MIN_WIDTH = 1024;

/** Below this the side panes and search box narrow so the table keeps room. */
const ROOMY_MIN_WIDTH = 1280;

type Notice = { tone: 'success' | 'danger'; text: string };
type ScopeParams = { kind?: string; category?: string; list?: string };

const plural = (n: number) => `${n} save${n === 1 ? '' : 's'}`;

/**
 * Desktop browse & organize (HAN-15): sidebar of Kinds > Categories > Lists, a table of saves with search and
 * multi-select, and a detail pane. Saves can be moved in bulk (Move to…, or dragged onto a list) or deleted.
 * The sidebar selection lives in the URL (?kind= / ?category= / ?list=) so reload and Back keep it.
 */
export function DesktopLibrary() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<ScopeParams>();
  const scope = scopeFromParams(params);
  const scopeKey = JSON.stringify(scope);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query.trim(), 250);
  const library = useAsync(fetchLibrary, []);
  const items = useAsync(() => fetchLibraryItems(scope, debouncedQuery), [scopeKey, debouncedQuery]);
  const rows = items.data ?? [];

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const searchRef = useRef<TextFieldHandle>(null);

  // Only rows on screen count, so a stale selection can never be moved or deleted unseen.
  const visibleSelected = new Set(rows.filter((item) => selected.has(item.id)).map((item) => item.id));
  const activeItem = rows.find((item) => item.id === activeId) ?? null;
  const itemsById = (ids: string[]) => rows.filter((item) => ids.includes(item.id));
  /** Bulk actions apply to the checked rows, or the open save when nothing is checked. */
  const targets = () => (visibleSelected.size ? [...visibleSelected] : activeItem ? [activeItem.id] : []);

  function clearSelection() {
    setSelected(new Set());
    setAnchor(null);
  }

  function setScope(next: LibraryScope) {
    clearSelection();
    setActiveId(null);
    router.setParams({
      kind: next.type === 'kind' ? next.kind : undefined,
      category: next.type === 'category' ? next.categoryId : undefined,
      list: next.type === 'list' ? next.listId : undefined,
    });
  }

  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function show(next: Notice) {
    clearTimeout(noticeTimer.current);
    setNotice(next);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  async function move(ids: string[], listId: string) {
    setMoveIds(null);
    const moving = itemsById(ids).filter((item) => item.list_id !== listId);
    if (!moving.length) return;
    const listName = findList(library.data, listId) ?? 'that list';
    try {
      const { skipped } = await moveItems(moving, listId);
      const moved = moving.length - skipped.length;
      show(
        skipped.length
          ? {
              tone: 'danger',
              text: `${moved ? `Moved ${plural(moved)} to ${listName}. ` : ''}${listName} already has ${skipped.join(', ')}, so ${skipped.length === 1 ? 'it was' : 'they were'} left where ${skipped.length === 1 ? 'it was' : 'they were'}.`,
            }
          : { tone: 'success', text: `Moved ${plural(moved)} to ${listName}.` },
      );
      clearSelection();
    } catch (e) {
      show({ tone: 'danger', text: `Couldn’t move: ${(e as Error).message}` });
    }
    items.refresh();
    library.refresh();
  }

  async function remove(ids: string[]) {
    const removing = itemsById(ids);
    if (!removing.length) return;
    const what = removing.length === 1 ? `“${removing[0].name}”` : plural(removing.length);
    if (!(await confirmDestructive(`Delete ${what}?`, 'This can’t be undone.', 'Delete'))) return;
    try {
      await deleteItems(removing.map((item) => item.id));
      show({ tone: 'success', text: `Deleted ${what}.` });
      clearSelection();
    } catch (e) {
      show({ tone: 'danger', text: `Couldn’t delete: ${(e as Error).message}` });
    }
    items.refresh();
    library.refresh();
  }

  function openMove(ids: string[]) {
    if (ids.length && library.data) setMoveIds(ids);
  }

  function step(delta: 1 | -1) {
    if (!rows.length) return;
    const index = rows.findIndex((item) => item.id === activeId);
    const next = index === -1 ? (delta === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, index + delta));
    setActiveId(rows[next].id);
    setAnchor(rows[next].id);
  }

  useShortcuts(({ key, mod, inTextField }) => {
    if (key === 'Escape') {
      if (moveIds) setMoveIds(null);
      else if (inTextField) searchRef.current?.blur();
      else if (visibleSelected.size) clearSelection();
      else setActiveId(null);
      return true;
    }
    if (moveIds) return false;
    if (mod && key.toLowerCase() === 'k') {
      searchRef.current?.focus();
      return true;
    }
    if (inTextField) return false;
    if (key === '/') {
      searchRef.current?.focus();
      return true;
    }
    if (mod && key.toLowerCase() === 'a') {
      setSelected(new Set(rows.map((item) => item.id)));
      return true;
    }
    if (mod) return false;
    switch (key) {
      case 'ArrowDown':
      case 'j':
        step(1);
        return true;
      case 'ArrowUp':
      case 'k':
        step(-1);
        return true;
      case ' ':
      case 'x':
        if (activeId) setSelected((s) => toggleOne(s, activeId));
        return !!activeId;
      case 'm':
        openMove(targets());
        return true;
      case 'Delete':
      case 'Backspace':
        remove(targets());
        return true;
    }
    return false;
  });

  const roomy = width >= ROOMY_MIN_WIDTH;
  const sidebarWidth = roomy ? 260 : 220;
  const detailWidth = roomy ? 340 : 280;
  const wide = width - sidebarWidth - detailWidth >= 680;
  const count = visibleSelected.size;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Sidebar
        library={library.data}
        error={library.error}
        scope={scope}
        onScope={setScope}
        onDropItems={move}
        width={sidebarWidth}
        footer={
          <>
            <Button title="Stash a link" onPress={() => router.push('/stash')} />
            <ThemedText type="small" themeColor="textSecondary">
              / search · j k move · x select · m move to · ⌫ delete
            </ThemedText>
            <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
          </>
        }
      />

      <View style={styles.main}>
        <View style={[styles.header, { borderColor: theme.border }]}>
          <View style={styles.title}>
            <ThemedText type="sectionTitle" numberOfLines={1}>
              {scopeTitle(scope, library.data)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {items.data ? plural(rows.length) : ' '}
            </ThemedText>
          </View>
          <TextField
            ref={searchRef}
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              clearSelection();
            }}
            placeholder="Search names and #tags"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search your saves"
            style={[styles.search, { width: roomy ? 320 : 220 }]}
          />
        </View>

        {count ? (
          <View style={[styles.toolbar, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
              {count} selected
            </ThemedText>
            <Button title="Move to…" variant="secondary" onPress={() => openMove([...visibleSelected])} />
            <Button title="Delete" variant="secondary" onPress={() => remove([...visibleSelected])} />
            <Button title="Clear" variant="secondary" onPress={clearSelection} />
          </View>
        ) : null}

        {notice ? (
          <ThemedText type="small" themeColor={notice.tone} accessibilityRole="alert" style={styles.notice}>
            {notice.text}
          </ThemedText>
        ) : null}

        <ScrollView style={styles.flex}>
          {items.error ? (
            <View style={styles.message}>
              <ThemedText type="small" themeColor="danger">
                Couldn’t load your saves: {items.error.message}
              </ThemedText>
              <Button title="Try again" variant="secondary" onPress={items.refresh} />
            </View>
          ) : !items.data ? (
            <ActivityIndicator style={styles.message} />
          ) : rows.length === 0 ? (
            <ThemedText themeColor="textSecondary" style={styles.message}>
              {debouncedQuery ? `Nothing here matches “${debouncedQuery}”.` : 'Nothing saved here yet.'}
            </ThemedText>
          ) : (
            <ItemTable
              items={rows}
              selected={visibleSelected}
              activeId={activeId}
              wide={wide}
              onRowPress={(item, modifiers) => {
                if (modifiers.toggle || modifiers.range) {
                  setSelected(clickSelect(visibleSelected, rows.map((r) => r.id), anchor, item.id, modifiers));
                }
                if (!modifiers.range) setAnchor(item.id);
                setActiveId(item.id);
              }}
              onToggle={(item) => {
                setSelected(toggleOne(visibleSelected, item.id));
                setAnchor(item.id);
              }}
              onToggleAll={() =>
                setSelected(count === rows.length ? new Set() : new Set(rows.map((item) => item.id)))
              }
              dragIds={(item) => actionTargets(visibleSelected, item.id)}
            />
          )}
        </ScrollView>
      </View>

      <DetailPane
        item={activeItem}
        selectedCount={count}
        width={detailWidth}
        onOpenList={(listId) => setScope({ type: 'list', listId })}
        onMove={() => activeItem && openMove(actionTargets(visibleSelected, activeItem.id))}
        onDelete={() => activeItem && remove(actionTargets(visibleSelected, activeItem.id))}
      />

      {moveIds && library.data ? (
        <MoveMenu
          count={moveIds.length}
          library={library.data}
          onPick={(listId) => move(moveIds, listId)}
          onClose={() => setMoveIds(null)}
        />
      ) : null}
    </View>
  );
}

function scopeFromParams({ kind, category, list }: ScopeParams): LibraryScope {
  if (list) return { type: 'list', listId: list };
  if (category) return { type: 'category', categoryId: category };
  if (kind && (KINDS as readonly string[]).includes(kind)) return { type: 'kind', kind: kind as Kind };
  return { type: 'all' };
}

function scopeTitle(scope: LibraryScope, library: KindCategory[] | undefined): string {
  switch (scope.type) {
    case 'all':
      return 'All saves';
    case 'kind':
      return KIND_LABELS[scope.kind];
    case 'category': {
      const category = library?.find((c) => c.id === scope.categoryId);
      return category ? `${KIND_LABELS[category.kind]} › ${category.name}` : '';
    }
    case 'list': {
      const category = library?.find((c) => c.lists.some((l) => l.id === scope.listId));
      const list = category?.lists.find((l) => l.id === scope.listId);
      return category && list ? `${category.name} › ${list.name}` : '';
    }
  }
}

function findList(library: KindCategory[] | undefined, listId: string): string | undefined {
  for (const category of library ?? []) {
    const list = category.lists.find((l) => l.id === listId);
    if (list) return `${category.name} › ${list.name}`;
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  main: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  title: { flex: 1, minWidth: 0 },
  search: { minHeight: 44 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  notice: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  message: { margin: Spacing.four, gap: Spacing.two },
  flex: { flex: 1 },
});
