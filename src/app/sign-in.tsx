import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/**
 * Passwordless sign-in. Supabase emails a magic link (opens /auth/callback) and,
 * if the email template includes {{ .Token }}, a 6-digit code that can be typed
 * here instead — handy on iOS when the link opens in a different browser.
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink() {
    const address = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setError('Enter a valid email address.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: Linking.createURL('auth/callback') },
    });
    setBusy(false);
    if (error) return setError(error.message);
    setSentTo(address);
  }

  async function verifyCode() {
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: sentTo, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError(error.message);
    // On success the auth listener swaps the stack to the app.
  }

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="subtitle">StashtagAI</ThemedText>
        <ThemedText themeColor="textSecondary">Save Instagram and TikTok posts as organised lists.</ThemedText>
      </View>

      {sentTo ? (
        <>
          <ThemedText>
            Check {sentTo} for a sign-in link. Or enter the code from the email:
          </ThemedText>
          <TextField
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={10}
            onSubmitEditing={verifyCode}
          />
          <Button title="Sign in with code" onPress={verifyCode} loading={busy} disabled={code.trim().length < 6} />
          <Button title="Use a different email" variant="secondary" onPress={() => setSentTo(null)} />
        </>
      ) : (
        <>
          <TextField
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={sendLink}
            invalid={!!error}
          />
          <Button title="Email me a sign-in link" onPress={sendLink} loading={busy} />
        </>
      )}

      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, marginTop: Spacing.five, marginBottom: Spacing.three },
});
