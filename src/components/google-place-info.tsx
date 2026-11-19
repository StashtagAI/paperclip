import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { googleRating, openStatus, todayIndex } from '@/lib/hours';
import type { ItemRow } from '@/lib/types';

type Props = { item: Pick<ItemRow, 'google_rating' | 'google_rating_count' | 'opening_hours'> };

/**
 * One line under a restaurant on its list (HAN-83): "4.6 ★ (2,310) on Google · Open · until 10 PM". Read out as one
 * phrase in words. Open or closed is always spelled out, never shown by colour alone.
 */
export function PlaceFacts({ item }: Props) {
  const rating = googleRating(item.google_rating, item.google_rating_count);
  const status = openStatus(item.opening_hours);
  if (!rating && !status) return null;
  const text = [rating && `${rating.text} on Google`, status?.text].filter(Boolean).join(' · ');
  const spoken = [rating?.spoken, status?.spoken].filter(Boolean).join('. ');
  return (
    <ThemedText type="small" themeColor="textSecondary" accessibilityLabel={spoken}>
      {text}
    </ThemedText>
  );
}

/** The week's hours on the item screen, today in bold and named as today for screen readers. */
export function WeeklyHours({ item }: Props) {
  const rating = googleRating(item.google_rating, item.google_rating_count);
  const hours = item.opening_hours;
  const status = openStatus(hours);
  const today = hours ? todayIndex(hours) : null;
  if (!rating && !hours?.weekday.length) return null;
  return (
    <View style={styles.box}>
      <ThemedText type="smallBold" accessibilityRole="header">
        From Google Maps
      </ThemedText>
      {rating ? (
        <ThemedText type="small" accessibilityLabel={rating.spoken}>
          {rating.text}
        </ThemedText>
      ) : null}
      {status ? (
        <ThemedText type="small" accessibilityLabel={status.spoken}>
          {status.text}
        </ThemedText>
      ) : null}
      {hours?.weekday.map((line, i) => (
        <ThemedText
          key={line}
          type={i === today ? 'smallBold' : 'small'}
          themeColor={i === today ? 'text' : 'textSecondary'}
          accessibilityLabel={i === today ? `Today, ${line}` : line}>
          {line}
        </ThemedText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.half },
});
