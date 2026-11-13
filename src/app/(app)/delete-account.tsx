import { router } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteAccount } from '@/lib/account';

const WORD = 'DELETE';

/**
 * Step 2 of deleting an account (step 1 is the dialog on Profile). The user has to type DELETE before the button
 * works, so it can't happen in a single tap. What is deleted is described in legal/data-deletion.md.
 */
export default function DeleteAccountScreen() {
  const theme = useTheme();
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed.trim() === WORD;

  async function remove() {
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    AccessibilityInfo.announceForAccessibility('Deleting your account');
    try {
      // Signs out on success; the root layout then swaps to the sign-in screen.
      await deleteAccount();
      toast('Your account was deleted.');
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <Screen edges="none">
      <ThemedText>
        Your account, stashes, categories, lists, items and feedback will be permanently deleted. This can’t be undone.
      </ThemedText>
      <ThemedText type="smallBold">Type {WORD} to confirm.</ThemedText>
      <TextField
        value={typed}
        onChangeText={(t) => {
          setTyped(t);
          setError(null);
        }}
        autoFocus
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        placeholder={WORD}
        accessibilityLabel={`Type ${WORD} to confirm`}
        returnKeyType="done"
        onSubmitEditing={remove}
        editable={!deleting}
      />

      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete my account permanently"
        accessibilityState={{ disabled: !confirmed || deleting, busy: deleting }}
        disabled={!confirmed || deleting}
        onPress={remove}
        style={({ pressed }) => [
          styles.delete,
          { backgroundColor: theme.danger, opacity: !confirmed || deleting ? 0.5 : pressed ? 0.8 : 1 },
        ]}>
        <ThemedText type="smallBold" style={{ color: theme.onDanger }}>
          {deleting ? 'Deleting…' : 'Delete my account'}
        </ThemedText>
      </Pressable>
      <Button title="Cancel" variant="secondary" onPress={() => router.back()} disabled={deleting} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  delete: {
    minHeight: 48,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
});
