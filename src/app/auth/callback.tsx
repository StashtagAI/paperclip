import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** Magic-link landing route: stashtag://auth/callback?code=… (native) or /auth/callback?code=… (web). */
export default function AuthCallback() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(params.error_description ?? null);

  useEffect(() => {
    // Web exchanges the code itself (detectSessionInUrl); native must do it here.
    if (Platform.OS === 'web' || !params.code || session) return;
    supabase.auth.exchangeCodeForSession(params.code).then(({ error }) => {
      if (error) setError(error.message);
    });
  }, [params.code, session]);

  if (session) return <Redirect href="/" />;

  return (
    <ThemedView style={styles.container}>
      {error ? (
        <>
          <ThemedText>Sign-in link failed: {error}</ThemedText>
          <Button title="Back to sign in" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <ActivityIndicator />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
});
