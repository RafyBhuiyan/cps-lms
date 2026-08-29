'use client';

/**
 * Runs an async load and tracks its outcome.
 *
 * `load` must be memoized by the caller (`useMemo`/`useCallback`) — the effect
 * re-runs whenever it changes — and may be `null` while a prerequisite such as the
 * auth token is still unknown, which keeps every page from having to guard its own
 * fetch.
 */

import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-runs `load`; used after a write that changes what was read. */
  reload: () => void;
};

export function useAsync<T>(load: (() => Promise<T>) | null): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(load !== null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!load) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError(null);

    load()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      });

    // A page can be left before its fetch resolves; without this the resolved
    // handler would set state on an unmounted component.
    return () => {
      cancelled = true;
    };
  }, [load, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, error, loading, reload };
}
