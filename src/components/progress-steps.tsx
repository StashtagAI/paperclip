import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { STEPS, type StepKey } from '@/lib/progress';

const nativeDriver = Platform.OS !== 'web';

/**
 * The steps process-link goes through (HAN-42): done ones get a check, the current one a pulsing dot and its detail
 * line, later ones an empty circle. State is in the icon shape, the weight and the spoken label, not only the colour.
 * `current="done"` shows them all checked (the example card). The pulse and the bar's slide are off with Reduce Motion.
 */
export function ProgressSteps({ current }: { current: StepKey | 'done' }) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const at = current === 'done' ? STEPS.length : STEPS.findIndex((s) => s.key === current);

  // Fill to the middle of the current step: it's under way, not finished.
  const fill = Math.min(1, (at + (current === 'done' ? 0 : 0.5)) / STEPS.length);
  const width = useState(() => new Animated.Value(fill))[0];
  useEffect(() => {
    if (reduceMotion) return width.setValue(fill);
    const anim = Animated.timing(width, { toValue: fill, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [fill, reduceMotion, width]);

  return (
    <View style={styles.wrap}>
      {/* Decorative: the rows below say the same thing. */}
      <View
        style={[styles.track, { backgroundColor: theme.backgroundSelected }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Animated.View
          style={[
            styles.bar,
            {
              backgroundColor: current === 'done' ? theme.success : theme.tint,
              width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
      </View>
      {STEPS.map((step, i) => {
        const state = i < at ? 'done' : i === at ? 'current' : 'todo';
        return (
          <View
            key={step.key}
            style={styles.row}
            accessible
            accessibilityLabel={`${step.label}, ${STATE_WORDS[state]}`}>
            <View style={styles.icon}>
              {state === 'current' ? (
                <PulseDot color={theme.tint} still={reduceMotion} />
              ) : (
                <SymbolView
                  name={state === 'done' ? DONE_SYMBOL : TODO_SYMBOL}
                  tintColor={state === 'done' ? theme.success : theme.textSecondary}
                  size={22}
                  weight="semibold"
                />
              )}
            </View>
            <View style={styles.text}>
              <ThemedText
                type={state === 'current' ? 'defaultBold' : 'small'}
                themeColor={state === 'todo' ? 'textSecondary' : 'text'}>
                {step.label}
              </ThemedText>
              {state === 'current' && step.detail ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {step.detail}
                </ThemedText>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const STATE_WORDS = { done: 'done', current: 'in progress', todo: 'not started' } as const;
const DONE_SYMBOL = { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' } as const;
const TODO_SYMBOL = { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' } as const;

/** A filled dot in a ring that gently breathes; holds still with Reduce Motion. */
function PulseDot({ color, still }: { color: string; still: boolean }) {
  const opacity = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    if (still) return opacity.setValue(1);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: nativeDriver }),
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, opacity]);
  return (
    <View style={[styles.ring, { borderColor: color }]}>
      <Animated.View style={[styles.dot, { backgroundColor: color, opacity }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  track: { height: 6, borderRadius: Radius.chip, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: Radius.chip },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  icon: { width: 24, minHeight: 22, alignItems: 'center', justifyContent: 'center', paddingTop: 1 },
  text: { flex: 1, gap: 2 },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
