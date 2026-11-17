import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const ratingLabel = (rating: number | null) =>
  rating ? `${rating} ${rating === 1 ? 'star' : 'stars'} out of 5` : 'Not rated';

/**
 * 1–5 stars as a radio group, so VoiceOver/TalkBack read "3 stars, selected" and each star is a 44pt target. Filled
 * vs. outline shape and the "3 of 5" text carry the value, not colour alone.
 */
export function StarRating({
  rating,
  onChange,
  disabled,
}: {
  rating: number | null;
  onChange: (rating: number | null) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Your rating" style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = rating != null && n <= rating;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={n === 1 ? '1 star' : `${n} stars`}
              accessibilityState={{ checked: rating === n, disabled }}
              style={({ pressed }) => [styles.star, pressed && styles.pressed]}>
              {/* Glyphs, not Material Symbols: that font draws "star" and "star_border" alike on Android and web. */}
              <ThemedText style={[styles.glyph, { color: theme.link }]} maxFontSizeMultiplier={1.6}>
                {filled ? '★' : '☆'}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <ThemedText type="small" themeColor="textSecondary" importantForAccessibility="no" accessibilityElementsHidden>
        {rating ? `${rating} of 5` : 'Not rated'}
      </ThemedText>
      {rating ? (
        <Pressable
          onPress={() => onChange(null)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Clear rating"
          hitSlop={12}
          style={styles.clear}>
          <ThemedText type="smallBold" style={{ color: theme.link }}>
            Clear
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Spacing.three, rowGap: Spacing.one },
  stars: { flexDirection: 'row', flexWrap: 'wrap' },
  glyph: { fontSize: 30, lineHeight: 36 },
  star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  clear: { minHeight: 44, justifyContent: 'center' },
});
