import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Speaks a status change on iOS. Android and web read the same text from an `accessibilityLiveRegion` status line
 * instead (announceForAccessibility is a no-op on web), so callers render one next to the control as well.
 */
export function announce(message: string) {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
}
