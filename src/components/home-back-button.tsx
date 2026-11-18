import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * The header's back button for a screen with nothing under it, e.g. one opened straight from a shared link or a
 * notification (HAN-91). The native back button only appears when there's a screen to go back to; this one goes Home.
 */
export function HomeBackButton() {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.replace('/')}
      accessibilityRole="button"
      accessibilityLabel="Back"
      accessibilityHint="Returns to your stash"
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <SymbolView
        name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
        tintColor={theme.tint}
        size={22}
        weight="semibold"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
