import { useEffect, useState } from 'react';

const QUERY = '(prefers-contrast: more)';

/** The browser's `prefers-contrast: more` (set by Increase Contrast on iOS and macOS), kept current (HAN-78). */
export function useIncreaseContrast() {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const onChange = () => setOn(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return on;
}
