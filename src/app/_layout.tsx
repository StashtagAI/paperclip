import '@/global.css';
// Defines the background geofencing task; must load before the app can be woken for it (HAN-43).
import '@/lib/nudge-service';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    // Share sheet entry (expo-share-intent); disabled on web by the library.
    <ShareIntentProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <RootStack />
        </AuthProvider>
      </ThemeProvider>
    </ShareIntentProvider>
  );
}

function RootStack() {
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (!supabaseConfigured) return <SetupNeeded />;
  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" />
    </Stack>
  );
}

function SetupNeeded() {
  return (
    <ThemedView style={styles.setup}>
      <View style={styles.setupBody}>
        <ThemedText type="subtitle">Supabase not configured</ThemedText>
        <ThemedText themeColor="textSecondary">
          Copy .env.example to .env.local, set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart
          `npx expo start`.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  setup: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  setupBody: { gap: Spacing.two, maxWidth: 480, alignSelf: 'center' },
});
