/**
 * Theme hooks; both follow the system appearance.
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, KindColors, type ColorScheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useScheme(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useTheme() {
  return Colors[useScheme()];
}

/** Per-kind fill, on-colour and chip colours (see `KindColors`). */
export function useKindColors() {
  return KindColors[useScheme()];
}
