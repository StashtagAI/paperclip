import { useCallback, useEffect, useState } from 'react';

import { toError } from '@/lib/errors';

type AsyncState<T> = { data: T | undefined; error: Error | undefined; loading: boolean };

/** Minimal fetch-on-mount hook with manual refresh; enough for a single-user beta. */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: undefined, loading: true });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const fetch = useCallback(
    async (quiet: boolean) => {
      if (!quiet) setState((s) => ({ ...s, loading: true }));
      try {
        setState({ data: await run(), error: undefined, loading: false });
      } catch (e) {
        setState((s) => ({ ...s, error: toError(e), loading: false }));
      }
    },
    [run],
  );
  const refresh = useCallback(() => fetch(false), [fetch]);
  /** Re-reads without `loading`, so a pull-to-refresh spinner doesn't flash on each poll. */
  const poll = useCallback(() => fetch(true), [fetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh, poll };
}
