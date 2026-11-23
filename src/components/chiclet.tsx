import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChicletProps = {
  onPress: () => void;
  /** What VoiceOver/TalkBack reads; icon-only chiclets have no visible text, so this is their only name. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Short visible text. Leave out for an icon-only chiclet. */
  label?: string;
  icon?: SymbolViewProps['name'];
  color?: string;
};

/**
 * A small pill button for the actions at the bottom of an item card (HAN-123), so they sit on one line instead of
 * two rows of full-height links. The pill stays compact; hitSlop takes the tap area to 48pt.
 */
export function Chiclet({ onPress, accessibilityLabel, accessibilityHint, label, icon, color }: ChicletProps) {
  const theme = useTheme();
  const ink = color ?? theme.link;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      // Sideways slop is half the 4pt gap between chiclets, so neighbouring tap areas meet without overlapping.
      hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
      style={({ pressed }) => [
        styles.chiclet,
        label ? styles.text : styles.iconOnly,
        { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      {icon ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SymbolView name={icon} tintColor={ink} size={16} weight="semibold" />
        </View>
      ) : null}
      {label ? (
        <ThemedText type="smallBold" style={{ color: ink }}>
          {label}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chiclet: {
    minHeight: 32,
    borderWidth: 1,
    borderRadius: Radius.chip,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  text: { paddingHorizontal: 6 },
  iconOnly: { minWidth: 40, paddingHorizontal: 6 },
});
