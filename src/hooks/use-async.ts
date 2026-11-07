import { useCallback, useEffect, useState } from 'react';

type AsyncState<T> = { data: T | undefined; error: Error | undefined; loading: boolean };

/** Minimal fetch-on-mount hook with manual refresh; enough for a single-user beta. */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: undefined, loading: true });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      setState({ data: await run(), error: undefined, loading: false });
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e : new Error(String(e)), loading: false }));
    }
  }, [run]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
