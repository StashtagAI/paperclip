import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';

/** Calls `refresh` every `ms` while `active` and the screen is in front, e.g. while a link is still being sorted. */
export function usePollWhile(active: boolean, refresh: () => void, ms = 5000) {
  const focused = useIsFocused();
  useEffect(() => {
    if (!active || !focused) return;
    const timer = setInterval(refresh, ms);
    return () => clearInterval(timer);
  }, [active, focused, refresh, ms]);
}
