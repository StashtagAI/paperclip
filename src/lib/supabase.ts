import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False when the EXPO_PUBLIC_SUPABASE_* env vars are missing; the app shows setup help instead. */
export const supabaseConfigured = Boolean(url && anonKey);

// The web build is pre-rendered in Node at export time (static output, so Expo Hosting serves our security
// headers). There is no window or localStorage there, so that render runs signed out with no stored session.
const serverRender = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: {
    storage: serverRender ? undefined : AsyncStorage,
    autoRefreshToken: !serverRender,
    persistSession: !serverRender,
    // Web picks the magic-link code up from the URL; native handles it in /auth/callback.
    detectSessionInUrl: Platform.OS === 'web' && !serverRender,
    flowType: 'pkce',
  },
});

// On native, only refresh tokens while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
