import { SymbolView } from 'expo-symbols';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

const SIZE = 28;

/**
 * The Visited/Tried/Cooked/Done check on an item (HAN-41): an empty ring, or a filled circle with a check mark,
 * so the state never rests on colour alone. Ticking it pops the mark; with Reduce Motion on it just appears.
 */
export function DoneCheck({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  // Pop only when the user ticks it, not when a list loads with items already checked.
  const wasChecked = useRef(checked);
  useEffect(() => {
    if (checked && !wasChecked.current) {
      scale.value = withSequence(
        withTiming(0.6, { duration: 0, reduceMotion: ReduceMotion.System }),
        withSpring(1, { damping: 9, stiffness: 260, reduceMotion: ReduceMotion.System }),
      );
    }
    wasChecked.current = checked;
  }, [checked, scale]);

  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      // 28pt ring, 48pt target.
      hitSlop={10}
      style={({ pressed }) => [styles.target, pressed && styles.pressed]}>
      <Animated.View
        style={[
          styles.ring,
          checked ? { backgroundColor: theme.success, borderColor: theme.success } : { borderColor: theme.textSecondary },
          pop,
        ]}>
        {checked ? (
          <SymbolView
            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
            tintColor={theme.onSuccess}
            size={16}
            weight="bold"
          />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { alignSelf: 'flex-start' },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
