import { useEffect, useRef } from 'react';

import type { ShortcutKey } from './use-shortcuts';

export type { ShortcutKey };

/** Listens on the document; the latest `onKey` is always used, so callers don't need to memoize it. */
export function useShortcuts(onKey: (key: ShortcutKey) => boolean) {
  const handler = useRef(onKey);
  useEffect(() => {
    handler.current = onKey;
  });

  useEffect(() => {
    function listener(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      const inTextField = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const handled = handler.current({
        key: event.key,
        mod: event.metaKey || event.ctrlKey,
        shift: event.shiftKey,
        inTextField,
      });
      if (handled) event.preventDefault();
    }
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);
}
