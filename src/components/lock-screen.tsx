import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, ScrollView, StyleSheet, View, findNodeHandle, type ViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signOutHere } from '@/lib/account';
import { biometricName, useAppLock } from '@/lib/app-lock';

/**
 * Covers the whole app while it's locked (HAN-49), and as a plain cover while the app is in the app switcher.
 * The stack underneath is hidden from VoiceOver/TalkBack by the root layout, so focus can't wander behind it.
 * It appears without animation, so there is nothing to reduce for Reduce Motion.
 */
export function LockScreen({ prompt }: { prompt: boolean }) {
  const theme = useTheme();
  const { unlock } = useAppLock();
  const [name, setName] = useState('Face ID');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<ViewInstance>(null);
  const prompted = useRef(false);

  useEffect(() => {
    biometricName().then(setName);
  }, []);

  async function tryUnlock() {
    setBusy(true);
    setError(null);
    const result = await unlock();
    setBusy(false);
    if (result.ok) {
      // The lock screen goes away, so this can't be a live region.
      AccessibilityInfo.announceForAccessibility('Unlocked');
    } else if (result.message) {
      setError(result.message);
      // Android and web read the live region on the error text; iOS has no live regions.
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(result.message);
    }
  }

  // Move VoiceOver/TalkBack to the heading, and ask for Face ID once the app is in the foreground. After that only the
  // button asks, so cancelling doesn't bring the sheet straight back.
  useEffect(() => {
    if (!prompt) return;
    const node = findNodeHandle(heading.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
    const askOnce = () => {
      if (prompted.current || AppState.currentState !== 'active') return;
      prompted.current = true;
      tryUnlock();
    };
    askOnce();
    const sub = AppState.addEventListener('change', askOnce);
    return () => sub.remove();
    // tryUnlock is recreated every render; this should only run when the lock screen starts prompting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  return (
    <SafeAreaView
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]}
      accessibilityViewIsModal
      importantForAccessibility="yes">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.body}>
          <View ref={heading} accessible accessibilityRole="header">
            <ThemedText type="subtitle">Stashtag is locked</ThemedText>
          </View>
          {prompt ? (
            <>
              <ThemedText themeColor="textSecondary">Unlock with {name} to see your stash.</ThemedText>
              {error ? (
                <ThemedText themeColor="danger" accessibilityLiveRegion="polite" aria-live="polite">
                  {error}
                </ThemedText>
              ) : null}
              <Button title={`Unlock with ${name}`} size="large" loading={busy} onPress={tryUnlock} />
              <Button
                title="Sign out"
                variant="secondary"
                accessibilityHint="Signs out on this phone. You can sign in again with your email."
                disabled={busy}
                onPress={signOutHere}
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four },
  body: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
});
