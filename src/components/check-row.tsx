import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  checked: boolean;
  onPress: () => void;
  /** What VoiceOver/TalkBack reads; the checked state is read from the role. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  children: ReactNode;
};

/**
 * A tappable row with a checkbox (HAN-74): picking recipes for the shopping list and ticking lines off it. The box
 * changes shape (empty / ticked), not just colour, so the state doesn't rely on colour alone.
 */
export function CheckRow({ checked, onPress, accessibilityLabel, accessibilityHint, children }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SymbolView
          name={
            checked
              ? { ios: 'checkmark.square.fill', android: 'check_box', web: 'check_box' }
              : { ios: 'square', android: 'check_box_outline_blank', web: 'check_box_outline_blank' }
          }
          tintColor={checked ? theme.tint : theme.textSecondary}
          size={24}
          weight="medium"
        />
      </View>
      <View style={styles.text}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  text: { flex: 1 },
});
