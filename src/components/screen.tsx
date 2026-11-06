import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import { RefreshControlProps, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = PropsWithChildren<{
  refreshControl?: ReactElement<RefreshControlProps>;
  /** 'top' for screens without a native header, 'none' under one. */
  edges?: 'top' | 'none';
  /** Pinned below the scroll view, e.g. the primary action on Home. */
  footer?: ReactNode;
}>;

/** Scrollable, safe-area-aware page container with the app's standard padding. */
export function Screen({ children, refreshControl, edges = 'top', footer }: Props) {
  const theme = useTheme();
  const safeEdges: Edge[] = [...(edges === 'top' ? (['top'] as const) : []), 'bottom'];
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={safeEdges}>
      <ScrollView
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
