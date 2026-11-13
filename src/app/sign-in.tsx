import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  EMAIL_RESEND_SECONDS,
  retryAfterSeconds,
  secondsLeft,
  sendLinkErrorMessage,
  signInErrorMessage,
  waitPhrase,
} from '@/lib/rate-limit';
import { supabase } from '@/lib/supabase';

type Mode = 'password' | 'link';

/**
 * Email + password sign-in (the default while testing), with passwordless as an alternative.
 * Passwordless: Supabase emails a magic link (opens /auth/callback) and, if the email template
 * includes {{ .Token }}, a 6-digit code that can be typed here instead.
 * Supabase Auth rate-limits emails and attempts (HAN-38); the resend button counts down its per-address window.
 */
export default function SignIn() {
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // When another sign-in email may be requested for `address` (Date.now() ms).
  const [resend, setResend] = useState<{ address: string; until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const typed = sentTo ?? email.trim().toLowerCase();
  const wait = resend && resend.address === typed ? secondsLeft(resend.until, now) : 0;

  useEffect(() => {
    if (!resend) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= resend.until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resend]);

  function startWait(address: string, seconds: number) {
    const t = Date.now();
    setNow(t);
    setResend({ address, until: t + seconds * 1000 });
  }

  // iOS has no live regions, so announce what changed; Android/web use the live regions below.
  useEffect(() => {
    const message = error ?? notice;
    if (message && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [error, notice]);

  function validEmail() {
    const address = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError('Enter a valid email address.');
      return null;
    }
    return address;
  }

  async function signInWithPassword() {
    const address = validEmail();
    if (!address) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({ email: address, password });
    setBusy(false);
    if (error) setError(signInErrorMessage(error));
    // On success the auth listener swaps the stack to the app.
  }

  async function signUp() {
    const address = validEmail();
    if (!address) return;
    if (password.length < 6) return setError('Use a password of at least 6 characters.');
    setBusy(true);
    setError(null);
    setNotice(null);
    const { data, error } = await supabase.auth.signUp({
      email: address,
      password,
      options: { emailRedirectTo: Linking.createURL('auth/callback') },
    });
    setBusy(false);
    if (error) return setError(signInErrorMessage(error));
    // No session means the project still requires email confirmation.
    if (!data.session) setNotice(`Account created. Confirm it from the email sent to ${address}, then sign in.`);
  }

  async function sendLink() {
    const address = sentTo ?? validEmail();
    if (!address || wait > 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: Linking.createURL('auth/callback') },
    });
    setBusy(false);
    if (error) {
      const retry = retryAfterSeconds(error);
      if (retry) startWait(address, retry);
      return setError(sendLinkErrorMessage(error));
    }
    startWait(address, EMAIL_RESEND_SECONDS);
    if (sentTo) setNotice(`A new sign-in email was sent to ${address}.`);
    else {
      setSentTo(address);
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(`Sign-in email sent to ${address}.`);
    }
  }

  async function verifyCode() {
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: sentTo, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError(signInErrorMessage(error));
  }

  function switchMode(next: Mode) {
    setMode(next);
    setSentTo(null);
    setError(null);
    setNotice(null);
  }

  const emailField = (
    <TextField
      value={email}
      onChangeText={setEmail}
      placeholder="you@example.com"
      keyboardType="email-address"
      textContentType="emailAddress"
      autoComplete="email"
      autoCapitalize="none"
      autoCorrect={false}
      onSubmitEditing={mode === 'link' ? sendLink : undefined}
      invalid={!!error}
    />
  );

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="subtitle">StashtagAI</ThemedText>
        <ThemedText themeColor="textSecondary">Save Instagram and TikTok posts as organised lists.</ThemedText>
      </View>

      {mode === 'password' ? (
        <>
          {emailField}
          <TextField
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            textContentType="password"
            autoComplete="password"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={signInWithPassword}
            invalid={!!error}
          />
          <Button title="Sign in" onPress={signInWithPassword} loading={busy} disabled={!password} />
          <Button title="Create account" variant="secondary" onPress={signUp} disabled={busy} />
          <Button title="Email me a sign-in link instead" variant="secondary" onPress={() => switchMode('link')} />
        </>
      ) : sentTo ? (
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
          <Button
            title={wait > 0 ? `Resend email in ${waitPhrase(wait)}` : 'Resend email'}
            variant="secondary"
            onPress={sendLink}
            disabled={busy || wait > 0}
          />
          <Button
            title="Use a different email"
            variant="secondary"
            onPress={() => {
              setSentTo(null);
              setError(null);
              setNotice(null);
            }}
          />
        </>
      ) : (
        <>
          {emailField}
          <Button
            title={wait > 0 ? `Email me a sign-in link (in ${waitPhrase(wait)})` : 'Email me a sign-in link'}
            onPress={sendLink}
            loading={busy}
            disabled={wait > 0}
          />
          <Button title="Sign in with a password instead" variant="secondary" onPress={() => switchMode('password')} />
        </>
      )}

      <View accessibilityLiveRegion="polite" aria-live="polite">
        {notice ? <ThemedText type="small">{notice}</ThemedText> : null}
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, marginTop: Spacing.five, marginBottom: Spacing.three },
});
