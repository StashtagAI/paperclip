import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Increase Contrast (iOS) or High contrast text (Android), kept current while the app is open (HAN-78). */
export function useIncreaseContrast() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let mounted = true;
    const ios = Platform.OS === 'ios';
    (ios ? AccessibilityInfo.isDarkerSystemColorsEnabled() : AccessibilityInfo.isHighTextContrastEnabled())
      .then((v) => mounted && setOn(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(ios ? 'darkerSystemColorsChanged' : 'highTextContrastChanged', setOn);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return on;
}
