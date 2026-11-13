import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A tappable card row used by the Category > List > Items browser. */
export function RowLink({
  href,
  title,
  subtitle,
  progress,
}: {
  href: Href;
  title: string;
  subtitle?: string;
  /** Draws a done bar under the subtitle; the subtitle must say the same in words (HAN-41). */
  progress?: { done: number; total: number };
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.text}>
          <ThemedText type="defaultBold">{title}</ThemedText>
          {subtitle ? (
            <ThemedText type="small" themeColor="textSecondary">
              {subtitle}
            </ThemedText>
          ) : null}
          {progress ? <ProgressBar done={progress.done} total={progress.total} /> : null}
        </View>
        <ThemedText themeColor="textSecondary">›</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: Spacing.two,
  },
  text: { flex: 1, gap: Spacing.one },
  pressed: { opacity: 0.7 },
});
