import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { SocialSignIn } from '@/components/social-sign-in';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { announce } from '@/lib/announce';
import { MIN_PASSWORD_LENGTH, RESEND_COOLDOWN_SECONDS, resetSentMessage } from '@/lib/password-reset';
import { retryAfterSeconds, sendLinkErrorMessage, signInErrorMessage, waitPhrase } from '@/lib/rate-limit';
import { socialErrorMessage, type SocialProvider } from '@/lib/sign-in-providers';
import { continueWith } from '@/lib/social-auth';
import { supabase } from '@/lib/supabase';

type Mode = 'password' | 'link' | 'reset';

/**
 * Email + password sign-in (the default while testing), with passwordless as an alternative.
 * Passwordless: Supabase emails a magic link (opens /auth/callback) and, if the email template
 * includes {{ .Token }}, a 6-digit code that can be typed here instead.
 * Supabase Auth rate-limits emails and attempts (HAN-38); the resend buttons count down its per-address window.
 * Forgot password (HAN-70): the same two ways of proving the inbox is yours — the reset link or its code — have to
 * happen before the password can change; then the root layout shows /reset-password.
 * Or Google, Apple or Facebook (HAN-112): an account with the same verified email is the same account.
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
  const [cooldown, setCooldown] = useState(0);
  const [socialBusy, setSocialBusy] = useState<SocialProvider | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function fail(message: string) {
    setError(message);
    announce(message);
  }

  function validEmail() {
    const address = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      fail('Enter a valid email address.');
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
    if (error) fail(signInErrorMessage(error));
    // On success the auth listener swaps the stack to the app.
  }

  async function signUp() {
    const address = validEmail();
    if (!address) return;
    if (password.length < MIN_PASSWORD_LENGTH) return fail(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    setBusy(true);
    setError(null);
    setNotice(null);
    const { data, error } = await supabase.auth.signUp({
      email: address,
      password,
      options: { emailRedirectTo: Linking.createURL('auth/callback') },
    });
    setBusy(false);
    if (error) return fail(signInErrorMessage(error));
    // No session means the project still requires email confirmation.
    if (!data.session) {
      const message = `Account created. Confirm it from the email sent to ${address}, then sign in.`;
      setNotice(message);
      announce(message);
    }
  }

  async function sendLink() {
    const address = validEmail();
    if (!address) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: Linking.createURL('auth/callback') },
    });
    setBusy(false);
    if (error) {
      const retry = retryAfterSeconds(error);
      if (retry) setCooldown(retry);
      return fail(sendLinkErrorMessage(error));
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (sentTo) {
      const message = `A new sign-in email was sent to ${address}.`;
      setNotice(message);
      announce(message);
    } else {
      setSentTo(address);
      announce(`Sign-in link sent to ${address}`);
    }
  }

  /** Emails a reset link and code. Nothing about the account changes until one of them is used. */
  async function sendReset(address = validEmail()) {
    if (!address) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: Linking.createURL('auth/callback'),
    });
    setBusy(false);
    if (error) {
      const retry = retryAfterSeconds(error);
      if (retry) setCooldown(retry);
      return fail(signInErrorMessage(error));
    }
    setSentTo(address);
    setCode('');
    setCooldown(RESEND_COOLDOWN_SECONDS);
    announce(resetSentMessage(address));
  }

  async function verifyCode() {
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    // A recovery code signs in with PASSWORD_RECOVERY, which keeps the app closed until a new password is saved.
    const { error } = await supabase.auth.verifyOtp({
      email: sentTo,
      token: code.trim(),
      type: mode === 'reset' ? 'recovery' : 'email',
    });
    setBusy(false);
    if (error) fail(signInErrorMessage(error));
  }

  async function signInWith(provider: SocialProvider) {
    setSocialBusy(provider);
    setError(null);
    setNotice(null);
    try {
      // 'done': the auth listener swaps the stack to the app. 'redirecting' (web): the page is leaving for the provider.
      if ((await continueWith(provider)) === 'redirecting') return;
    } catch (e) {
      fail(socialErrorMessage(provider, e as Error));
    }
    setSocialBusy(null);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setSentTo(null);
    setCode('');
    setError(null);
    setNotice(null);
  }

  const codeField = (
    <TextField
      value={code}
      onChangeText={setCode}
      placeholder="123456"
      accessibilityLabel="Code from the email"
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
      maxLength={10}
      autoFocus
      onSubmitEditing={verifyCode}
      invalid={!!error}
    />
  );

  const emailField = (
    <TextField
      value={email}
      onChangeText={setEmail}
      placeholder="you@example.com"
      accessibilityLabel="Email"
      keyboardType="email-address"
      textContentType="emailAddress"
      autoComplete="email"
      autoCapitalize="none"
      autoCorrect={false}
      onSubmitEditing={mode === 'link' ? sendLink : mode === 'reset' ? () => sendReset() : undefined}
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
            accessibilityLabel="Password"
            secureTextEntry
            textContentType="password"
            autoComplete="password"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={signInWithPassword}
            invalid={!!error}
          />
          <Button title="Sign in" onPress={signInWithPassword} loading={busy} disabled={!password} />
          <Button title="Forgot password?" variant="secondary" onPress={() => switchMode('reset')} />
          <Button title="Create account" variant="secondary" onPress={signUp} disabled={busy} />
          <Button title="Email me a sign-in link instead" variant="secondary" onPress={() => switchMode('link')} />
          <SocialSignIn busy={socialBusy} disabled={busy} onPress={signInWith} />
          <ThemedText type="small" themeColor="textSecondary">
            Already have an account? Use the same email and you’ll land in it. If you hide your email with Apple, sign
            in with your email first, then connect Apple in Profile.
          </ThemedText>
        </>
      ) : mode === 'reset' ? (
        sentTo ? (
          <>
            <ThemedText type="smallBold" accessibilityRole="header">
              Reset your password
            </ThemedText>
            <ThemedText>{resetSentMessage(sentTo)}</ThemedText>
            {codeField}
            <Button title="Continue" onPress={verifyCode} loading={busy} disabled={code.trim().length < 6} />
            <Button
              title={cooldown > 0 ? `Send again in ${cooldown}s` : 'Send again'}
              accessibilityLabel={cooldown > 0 ? `Send again, available in ${cooldown} seconds` : 'Send again'}
              variant="secondary"
              onPress={() => sendReset(sentTo)}
              disabled={busy || cooldown > 0}
            />
            <Button title="Back to sign in" variant="secondary" onPress={() => switchMode('password')} />
          </>
        ) : (
          <>
            <ThemedText type="smallBold" accessibilityRole="header">
              Reset your password
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              We’ll email you a link and a code. Your password only changes after you use one of them.
            </ThemedText>
            {emailField}
            <Button title="Email me a reset link" onPress={() => sendReset()} loading={busy} />
            <Button title="Back to sign in" variant="secondary" onPress={() => switchMode('password')} />
          </>
        )
      ) : sentTo ? (
        <>
          <ThemedText>
            Check {sentTo} for a sign-in link. Or enter the code from the email:
          </ThemedText>
          {codeField}
          <Button title="Sign in with code" onPress={verifyCode} loading={busy} disabled={code.trim().length < 6} />
          <Button
            title={cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
            accessibilityLabel={cooldown > 0 ? `Resend email, available in ${waitPhrase(cooldown)}` : 'Resend email'}
            variant="secondary"
            onPress={sendLink}
            disabled={busy || cooldown > 0}
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
          <Button title="Email me a sign-in link" onPress={sendLink} loading={busy} />
          <Button title="Sign in with a password instead" variant="secondary" onPress={() => switchMode('password')} />
          <SocialSignIn busy={socialBusy} disabled={busy} onPress={signInWith} />
          <ThemedText type="small" themeColor="textSecondary">
            Already have an account? Use the same email and you’ll land in it. If you hide your email with Apple, sign
            in with your email first, then connect Apple in Profile.
          </ThemedText>
        </>
      )}

      {notice ? (
        <ThemedText type="small" accessibilityLiveRegion="polite">
          {notice}
        </ThemedText>
      ) : null}
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
