import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A tappable card row used by the Category > List > Items browser. */
export function RowLink({ href, title, subtitle }: { href: Href; title: string; subtitle?: string }) {
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
  text: { flex: 1 },
  pressed: { opacity: 0.7 },
});
