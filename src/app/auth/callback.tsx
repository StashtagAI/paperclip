import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth, useRecovering } from '@/lib/auth';
import { inAppSocialFlow } from '@/lib/social-auth';
import { supabase } from '@/lib/supabase';

/**
 * Magic-link and Google/Apple/Facebook landing route: stashtag://auth/callback?code=… (native) or /auth/callback?code=…
 * (web). On Android the router also opens this for an in-app browser sign-in (HAN-112); that code belongs to
 * continueWith() in social-auth, so this screen just steps back out of the way.
 */
export default function AuthCallback() {
  const { session } = useAuth();
  // A password-reset link lands here too (HAN-70).
  const recovering = useRecovering();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [inApp] = useState(inAppSocialFlow);
  const [error, setError] = useState<string | null>(inApp ? null : (params.error_description ?? null));

  useEffect(() => {
    // Back to the sign-in screen or Profile, where continueWith() shows how it went.
    if (inApp) {
      if (router.canGoBack()) router.back();
      else router.replace(inApp === 'link' ? '/profile' : '/sign-in');
    }
  }, [inApp]);

  useEffect(() => {
    // Web exchanges the code itself (detectSessionInUrl); native must do it here.
    if (Platform.OS === 'web' || !params.code || session || inApp) return;
    supabase.auth.exchangeCodeForSession(params.code).then(({ error }) => {
      if (error) setError(error.message);
    });
  }, [params.code, session, inApp]);

  // Signed in with an error means connecting a provider from Profile failed on web (e.g. it's on another account).
  if (session && !inApp && !error) return <Redirect href={recovering ? '/reset-password' : '/'} />;

  return (
    <ThemedView style={styles.container}>
      {error ? (
        <>
          <ThemedText accessibilityRole="alert">
            {session ? 'Couldn’t connect' : 'Sign-in failed'}: {error}
          </ThemedText>
          <Button
            title={session ? 'Back to Profile' : 'Back to sign in'}
            onPress={() => router.replace(session ? '/profile' : '/sign-in')}
          />
        </>
      ) : (
        <ActivityIndicator accessibilityLabel="Signing in" />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
});
