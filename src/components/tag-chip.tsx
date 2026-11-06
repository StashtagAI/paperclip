import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useKindColors } from '@/hooks/use-theme';
import type { Kind } from '@/lib/types';

export function TagChip({ kind, tag }: { kind: Kind; tag: string }) {
  const k = useKindColors()[kind];
  return (
    <View style={[styles.chip, { backgroundColor: k.chip }]}>
      <ThemedText type="smallBold" style={{ color: k.onChip }} numberOfLines={1}>
        #{tag}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.one,
    maxWidth: 130,
  },
});
