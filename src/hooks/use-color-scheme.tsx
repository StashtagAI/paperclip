import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';
import { Appearance, Platform, useColorScheme as useSystemColorScheme } from 'react-native';

/** 'system' follows the device; 'light'/'dark' is the user's pick on the Profile page (HAN-34). */
export type SchemePreference = 'system' | 'light' | 'dark';

const KEY = 'stashtag.colorScheme';

type State = { preference: SchemePreference; setPreference: (p: SchemePreference) => void; ready: boolean };

const SchemeContext = createContext<State>({ preference: 'system', setPreference: () => {}, ready: true });

/** Holds the saved appearance (AsyncStorage, which is localStorage on web) and applies it app-wide. */
export function ColorSchemeProvider({ children }: PropsWithChildren) {
  const [preference, setState] = useState<SchemePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark') setState(v);
      })
      .finally(() => setReady(true));
  }, []);

  // Native: also override the OS appearance for this app, so alerts, keyboards and native headers match.
  useEffect(() => {
    if (Platform.OS !== 'web') Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  const setPreference = (p: SchemePreference) => {
    setState(p);
    (p === 'system' ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, p)).catch(() => {});
  };

  return <SchemeContext value={{ preference, setPreference, ready }}>{children}</SchemeContext>;
}

export function useSchemePreference() {
  return use(SchemeContext);
}

/** The scheme in effect: the user's pick, else the device setting. */
export function useColorScheme(): 'light' | 'dark' {
  const { preference } = use(SchemeContext);
  const system = useSystemColorScheme();
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}
