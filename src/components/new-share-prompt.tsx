import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import type { SharedWithMe } from '@/lib/data';
import { markSeen, newSharePrompt, refreshSharedWithMe, unseen } from '@/lib/shared-with-me';

// Not over the shared list or Shared with me (they show it already), or mid-stash from the share sheet.
const QUIET = /^\/(s\/|shared$|shared-list\/|share$|stash$)/;

/**
 * "<sharer> shared Restaurants › Denver with you" (HAN-71). Checks on launch and whenever the app comes back to the
 * foreground; either button marks the shares seen so each one pops up once.
 */
export function NewSharePrompt() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [fresh, setFresh] = useState<SharedWithMe[] | null>(null);
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let checking = false;
    async function check() {
      if (checking) return;
      checking = true;
      const rows = await refreshSharedWithMe();
      checking = false;
      const next = unseen(rows);
      if (next.length && !QUIET.test(path.current)) setFresh((open) => open ?? next);
    }
    check();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && check());
    return () => sub.remove();
  }, []);

  const prompt = fresh ? newSharePrompt(fresh) : null;

  function close() {
    // A failed mark leaves them new; the popup comes back next launch, which is fine.
    if (fresh) markSeen(fresh.map((s) => s.token)).catch(() => {});
    setFresh(null);
  }

  function view() {
    const token = prompt?.token;
    if (token) {
      close();
      router.push({ pathname: '/s/[token]', params: { token } });
    } else {
      // Shared with me marks them seen itself, after labelling them "New".
      setFresh(null);
      router.push('/shared');
    }
  }

  return (
    <Modal visible={!!prompt} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => close()}>
      {/* Scrolls so the buttons stay reachable at the largest text sizes. */}
      <ScrollView style={styles.backdrop} contentContainerStyle={styles.center}>
        {prompt ? (
          <View
            accessibilityViewIsModal
            role="dialog"
            aria-modal
            aria-labelledby="new-share-title"
            style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="sectionTitle" accessibilityRole="header" nativeID="new-share-title">
              {prompt.message}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {prompt.token
                ? 'It’s in your stash under its category. You can add and remove things in it too.'
                : 'They’re in Shared with me on your home screen.'}
            </ThemedText>
            <View style={styles.actions}>
              <Button
                title="View"
                size="large"
                onPress={view}
                accessibilityHint={prompt.token ? 'Opens the shared list' : 'Opens Shared with me'}
              />
              <Button title="Dismiss" size="large" variant="secondary" onPress={() => close()} />
            </View>
          </View>
        ) : null}
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
  actions: { gap: Spacing.two },
});
