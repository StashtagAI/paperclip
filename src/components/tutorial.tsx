import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Platform, ScrollView, StyleSheet, View, type HostInstance } from 'react-native';

import { Button } from '@/components/button';
import { PinMark } from '@/components/pin-mark';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { closeTutorial, stepLabel, TUTORIAL_STEPS, useTutorialOpen } from '@/lib/tutorial';

/**
 * "How StashtagAI works" (HAN-137): a few cards with Next / Back / Skip. Opens by itself the first time a new account
 * lands on an empty Home, and from Profile › Help any time after. Any way out counts as seen.
 */
export function Tutorial() {
  const open = useTutorialOpen();
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [index, setIndex] = useState(0);
  const heading = useRef<HostInstance>(null);

  // Start from the first card every time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIndex(0);
  }

  // The pressed button may be gone (Back on the first card, Next on the last), so screen reader and keyboard focus
  // move to the new card's heading, which also reads it out.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const node = heading.current;
      if (!node) return;
      if (Platform.OS === 'web') (node as unknown as HTMLElement).focus?.();
      else AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
    }, 50);
    return () => clearTimeout(timer);
  }, [open, index]);

  const step = TUTORIAL_STEPS[index];
  const last = index === TUTORIAL_STEPS.length - 1;

  function stashFirst() {
    closeTutorial();
    router.push('/stash');
  }

  return (
    <Modal visible={open} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={closeTutorial}>
      {/* Scrolls so the buttons stay reachable at the largest text sizes. */}
      <ScrollView style={styles.backdrop} contentContainerStyle={styles.center}>
        <View
          accessibilityViewIsModal
          role="dialog"
          aria-modal
          aria-labelledby="tutorial-title"
          style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.top}>
            {/* Read as part of the heading below. */}
            <ThemedText type="small" themeColor="textSecondary" importantForAccessibility="no" accessibilityElementsHidden>
              {stepLabel(index)}
            </ThemedText>
            {!last ? (
              <Button
                title="Skip"
                variant="secondary"
                onPress={closeTutorial}
                accessibilityLabel="Skip tutorial"
                accessibilityHint="Closes the tutorial. You can open it again from Profile."
              />
            ) : null}
          </View>

          <View style={styles.art} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {step.icon === 'pin' ? (
              <PinMark size={56} />
            ) : (
              <SymbolView name={step.icon as SymbolViewProps['name']} tintColor={theme.tint} size={48} weight="semibold" />
            )}
          </View>

          <View
            ref={heading}
            accessible
            accessibilityRole="header"
            tabIndex={-1}
            accessibilityLabel={`${stepLabel(index)}. ${step.title}`}>
            <ThemedText type="sectionTitle" nativeID="tutorial-title">
              {step.title}
            </ThemedText>
          </View>
          <ThemedText>{step.body}</ThemedText>

          {/* Progress is also spelled out above ("Step 2 of 5"), so the dots are decorative. */}
          <View style={styles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {TUTORIAL_STEPS.map((s, i) => (
              <View
                key={s.title}
                style={[
                  styles.dot,
                  i === index ? [styles.dotCurrent, { backgroundColor: theme.tint }] : { backgroundColor: theme.border },
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            {last ? (
              <>
                <Button
                  title="Stash a link"
                  size="large"
                  onPress={stashFirst}
                  accessibilityHint="Closes the tutorial and opens Stash a link"
                />
                <Button title="Done" size="large" variant="secondary" onPress={closeTutorial} />
              </>
            ) : (
              <Button title="Next" size="large" onPress={() => setIndex(index + 1)} />
            )}
            {index > 0 ? (
              <Button title="Back" size="large" variant="secondary" onPress={() => setIndex(index - 1)} />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  center: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four },
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  art: { alignItems: 'center', paddingVertical: Spacing.two },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotCurrent: { width: 20 },
  actions: { gap: Spacing.two },
});
