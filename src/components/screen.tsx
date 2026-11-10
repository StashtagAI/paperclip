import type { PropsWithChildren, ReactElement, ReactNode, Ref } from 'react';
import { RefreshControlProps, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = PropsWithChildren<{
  refreshControl?: ReactElement<RefreshControlProps>;
  /** 'top' for screens without a native header, 'none' under one. */
  edges?: 'top' | 'none';
  /** Pinned below the scroll view, e.g. the primary action on Home. */
  footer?: ReactNode;
  /** For screens that scroll to a child, e.g. the list map selecting a row. */
  scrollRef?: Ref<ScrollViewInstance>;
}>;

/** Scrollable, safe-area-aware page container with the app's standard padding. */
export function Screen({ children, refreshControl, edges = 'top', footer, scrollRef }: Props) {
  const theme = useTheme();
  const safeEdges: Edge[] = [...(edges === 'top' ? (['top'] as const) : []), 'bottom'];
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={safeEdges}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={refreshControl}>
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  footer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
});
