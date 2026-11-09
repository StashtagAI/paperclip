import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { KindIcon } from '@/components/kind-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useKindColors, useTheme } from '@/hooks/use-theme';
import type { KindCategory, LibraryScope } from '@/lib/data';
import { KIND_LABELS, KINDS } from '@/lib/types';

import { DropTarget } from './drag';

type Props = {
  library: KindCategory[] | undefined;
  error: Error | undefined;
  scope: LibraryScope;
  onScope: (scope: LibraryScope) => void;
  /** Saves dropped on a list. */
  onDropItems: (itemIds: string[], listId: string) => void;
  width: number;
  footer?: ReactNode;
};

/** Kinds > Categories > Lists with item counts. Lists accept dropped saves. */
export function Sidebar({ library, error, scope, onScope, onDropItems, width, footer }: Props) {
  const theme = useTheme();
  const kindColors = useKindColors();
  const total = library?.reduce((n, c) => n + c.lists.reduce((m, l) => m + l.itemCount, 0), 0);

  return (
    <View style={[styles.sidebar, { width, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Row label="All saves" count={total} active={scope.type === 'all'} onPress={() => onScope({ type: 'all' })} />
        {error ? (
          <ThemedText type="small" themeColor="danger">
            {error.message}
          </ThemedText>
        ) : null}
        {!library && !error ? <ActivityIndicator style={styles.loading} /> : null}
        {library
          ? KINDS.map((kind) => {
              const categories = library.filter((c) => c.kind === kind);
              const k = kindColors[kind];
              return (
                <View key={kind} style={styles.kind}>
                  <Row
                    label={KIND_LABELS[kind]}
                    icon={<KindIcon kind={kind} color={k.color} size={18} />}
                    active={scope.type === 'kind' && scope.kind === kind}
                    onPress={() => onScope({ type: 'kind', kind })}
                    strong
                  />
                  {categories.map((category) => (
                    <View key={category.id}>
                      <Row
                        label={category.name}
                        depth={1}
                        active={scope.type === 'category' && scope.categoryId === category.id}
                        onPress={() => onScope({ type: 'category', categoryId: category.id })}
                      />
                      {category.lists.map((list) => (
                        <DropTarget key={list.id} onDropItems={(ids) => onDropItems(ids, list.id)}>
                          {(over) => (
                            <Row
                              label={list.name}
                              count={list.itemCount}
                              depth={2}
                              over={over}
                              active={scope.type === 'list' && scope.listId === list.id}
                              onPress={() => onScope({ type: 'list', listId: list.id })}
                            />
                          )}
                        </DropTarget>
                      ))}
                    </View>
                  ))}
                </View>
              );
            })
          : null}
      </ScrollView>
      {footer ? <View style={[styles.footer, { borderColor: theme.border }]}>{footer}</View> : null}
    </View>
  );
}

function Row({
  label,
  count,
  icon,
  depth = 0,
  active,
  over,
  strong,
  onPress,
}: {
  label: string;
  count?: number;
  icon?: ReactNode;
  depth?: number;
  active: boolean;
  over?: boolean;
  strong?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { paddingLeft: Spacing.two + depth * Spacing.three },
        (active || pressed) && { backgroundColor: theme.backgroundSelected },
        over && { backgroundColor: theme.backgroundSelected, borderColor: theme.tint },
      ]}>
      {icon}
      <ThemedText
        type={strong || active ? 'smallBold' : 'small'}
        themeColor={active || strong ? 'text' : 'textSecondary'}
        numberOfLines={1}
        style={styles.label}>
        {label}
      </ThemedText>
      {count !== undefined ? (
        <ThemedText type="small" themeColor="textSecondary">
          {count}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sidebar: { borderRightWidth: 1 },
  content: { padding: Spacing.three, gap: Spacing.half },
  loading: { marginTop: Spacing.four },
  kind: { marginTop: Spacing.three, gap: Spacing.half },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 34,
    paddingRight: Spacing.two,
    borderRadius: Radius.row / 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  label: { flex: 1 },
  footer: { padding: Spacing.three, borderTopWidth: 1, gap: Spacing.two },
});
