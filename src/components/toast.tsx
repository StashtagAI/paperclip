import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const ToastContext = createContext<(message: string) => void>(() => {});

/**
 * A short confirmation shown over every screen for a few seconds. It appears without animation (nothing to reduce
 * for Reduce Motion) and is announced to VoiceOver/TalkBack. It never takes focus and needs no action.
 */
export function ToastProvider({ children }: PropsWithChildren) {
  const theme = useTheme();
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMessage(text);
    // iOS has no live regions; Android and web also get the polite live region below.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
    timer.current = setTimeout(() => setMessage(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext value={show}>
      {children}
      <SafeAreaView style={styles.overlay} edges={['bottom']} pointerEvents="box-none">
        <View accessibilityLiveRegion="polite" aria-live="polite" pointerEvents="none">
          {message ? (
            <View style={[styles.toast, { backgroundColor: theme.text }]}>
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                {message}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </ToastContext>
  );
}

export function useToast() {
  return use(ToastContext);
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  toast: {
    maxWidth: MaxContentWidth - Spacing.four * 2,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.five * 2,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radius.row,
  },
});
