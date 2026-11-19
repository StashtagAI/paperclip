import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';

import { afterWebRedirect } from '@/lib/social-auth';
import { supabase, supabaseConfigured } from '@/lib/supabase';

type AuthState = { session: Session | null; loading: boolean };

/**
 * True between proving inbox ownership for a password reset (reset link or code) and saving the new password. That
 * session can't open the app yet; the root layout shows only /reset-password (HAN-70).
 */
let recovering = false;
const recoveryListeners = new Set<() => void>();

function setRecovering(next: boolean) {
  if (recovering === next) return;
  recovering = next;
  recoveryListeners.forEach((listener) => listener());
}

// Registered at import, not in the provider: on web the client handles a reset link in the URL while it starts up,
// before any effect runs, and would emit PASSWORD_RECOVERY to nobody.
if (supabaseConfigured) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    else if (event === 'SIGNED_OUT') setRecovering(false);
    // Back from Apple's web sign-in (HAN-112). Deferred: the auth client must not be called inside its own callback.
    else if (event === 'SIGNED_IN') setTimeout(() => afterWebRedirect(session), 0);
  });
}

/** Call once the new password is saved, to let the session into the app. */
export function endRecovery() {
  setRecovering(false);
}

function subscribeRecovery(listener: () => void) {
  recoveryListeners.add(listener);
  return () => recoveryListeners.delete(listener);
}

export function useRecovering() {
  return useSyncExternalStore(subscribeRecovery, () => recovering, () => false);
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ session: null, loading: supabaseConfigured });

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext value={state}>{children}</AuthContext>;
}

export function useAuth() {
  return use(AuthContext);
}
