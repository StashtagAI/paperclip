import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A list's done progress (HAN-41): the bar, plus its words ("3 of 8 tried") so it never rests on colour.
 * With `label` it is one progress bar to VoiceOver/TalkBack; without, the bar is decoration next to text that says it.
 */
export function ProgressBar({ done, total, label }: { done: number; total: number; label?: string }) {
  const theme = useTheme();
  const fraction = total > 0 ? Math.min(done / total, 1) : 0;
  const bar = (
    <View style={[styles.track, { backgroundColor: theme.border }]}>
      <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: theme.success }]} />
    </View>
  );
  if (!label) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        {bar}
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Progress"
      accessibilityValue={{ min: 0, max: total, now: done, text: label }}
      style={styles.labelled}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {bar}
    </View>
  );
}

const styles = StyleSheet.create({
  labelled: { gap: Spacing.one },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
