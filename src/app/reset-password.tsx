import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Spacing } from '@/constants/theme';
import { announce } from '@/lib/announce';
import { endRecovery, useAuth } from '@/lib/auth';
import { MIN_PASSWORD_LENGTH, newPasswordError } from '@/lib/password-reset';
import { supabase } from '@/lib/supabase';

/**
 * Last step of "Forgot password?" (HAN-70). Only reachable after the reset link or code from the email signed this
 * device in, so whoever is here has shown they own the inbox. The app stays closed until the new password is saved.
 */
export default function ResetPassword() {
  const { session } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fail(message: string) {
    setError(message);
    announce(message);
  }

  async function save() {
    const invalid = newPasswordError(password, confirm);
    if (invalid) return fail(invalid);
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return fail(error.message);
    }
    // Anyone else signed in to this account (on another device) is signed out by the reset.
    await supabase.auth.signOut({ scope: 'others' });
    toast('Password updated.');
    // The root layout now swaps this screen for the app.
    endRecovery();
  }

  async function cancel() {
    setBusy(true);
    // Back to signed out; the old password still works.
    await supabase.auth.signOut();
  }

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="subtitle" accessibilityRole="header">
          Set a new password
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          {session?.user.email ? `For ${session.user.email}. ` : ''}At least {MIN_PASSWORD_LENGTH} characters.
        </ThemedText>
      </View>
      <TextField
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          setError(null);
        }}
        placeholder="New password"
        accessibilityLabel="New password"
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        invalid={!!error}
      />
      <TextField
        value={confirm}
        onChangeText={(t) => {
          setConfirm(t);
          setError(null);
        }}
        placeholder="Type it again"
        accessibilityLabel="Confirm new password"
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={save}
        invalid={!!error}
      />
      <Button title="Save new password" onPress={save} loading={busy} disabled={!password || !confirm} />
      <Button title="Cancel" variant="secondary" onPress={cancel} disabled={busy} />
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </ThemedText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, marginTop: Spacing.five, marginBottom: Spacing.three },
});
