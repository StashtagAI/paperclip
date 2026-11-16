import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** The OS Reduce Motion setting (`prefers-reduced-motion` on web), kept current while the app is open. */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => mounted && setReduce(on));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
