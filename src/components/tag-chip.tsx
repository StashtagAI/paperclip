import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useKindColors } from '@/hooks/use-theme';
import type { Kind } from '@/lib/types';

type TagChipProps = {
  kind: Kind;
  tag: string;
  /** Makes the chip a toggle (HAN-79): the list screen filters its items by the picked tag. */
  onPress?: () => void;
  selected?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function TagChip({ kind, tag, onPress, selected = false, accessibilityLabel, accessibilityHint }: TagChipProps) {
  const k = useKindColors()[kind];
  // Picked chips swap fill and text (the same tested contrast pair) and gain a check, so it isn't color alone.
  const fill = selected ? k.onChip : k.chip;
  const ink = selected ? k.chip : k.onChip;
  const label = (
    <ThemedText type="smallBold" style={{ color: ink }} numberOfLines={1}>
      {selected ? '✓ ' : ''}#{tag}
    </ThemedText>
  );
  if (!onPress) return <View style={[styles.chip, { backgroundColor: fill }]}>{label}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `#${tag}`}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      // The chip stays compact; the hit area reaches 44pt.
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={({ pressed }) => [
        styles.chip,
        styles.pressable,
        {
          backgroundColor: fill,
          borderColor: k.onChip,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      {label}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.one,
    maxWidth: 130,
  },
  // Tappable chips get an outline so they read as controls, and room for longer tags at large text sizes.
  pressable: {
    borderWidth: 1,
    minHeight: 28,
    justifyContent: 'center',
    maxWidth: '100%',
  },
});
