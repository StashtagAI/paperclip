/**
 * Theme hooks; both follow the system appearance, and `useTheme` also follows Increase Contrast (HAN-78).
 * https://docs.expo.dev/guides/color-schemes/
 */

import { KindColors, themeColors, type ColorScheme } from '@/constants/theme';
import { useColorScheme, useSchemePreference } from '@/hooks/use-color-scheme';

export function useScheme(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useTheme() {
  return themeColors(useScheme(), useSchemePreference().highContrast);
}

/** Per-kind fill, on-colour and chip colours (see `KindColors`). */
export function useKindColors() {
  return KindColors[useScheme()];
}
