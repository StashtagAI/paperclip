import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Light haptic feedback for Home's picks (HAN-48). Phones only: on web expo-haptics falls back to navigator.vibrate,
 * which buzzes Android browsers far harder than a tap should. Failures are ignored; haptics are never the only cue.
 */
export const haptic = {
  /** Opening a pick. */
  select() {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  },
  /** A new set of picks, or places near you found. */
  refresh() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
};
