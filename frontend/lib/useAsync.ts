'use client';

/**
 * Runs an async load and tracks its outcome.
 *
 * `load` must be memoized by the caller (`useMemo`/`useCallback`) — the effect
 * re-runs whenever it changes — and may be `null` while a prerequisite such as the
 * auth token is still unknown, which keeps every page from having to guard its own
 * fetch.
 *
 * `loading` is derived rather than stored. Storing it would mean flipping it from
 * inside the effect body, which is a synchronous setState in an effect: a cascading
 * render, and an error under `react-hooks/set-state-in-effect`. Instead the last
 * settled result records which attempt produced it, and anything else counts as
 * still loading.
 */

import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> = {
  /**
   * The last successful result. Deliberately kept while a reload is in flight, so
   * a page can show its previous state instead of blanking out.
   */
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-runs `load`; used after a write that changes what was read. */
  reload: () => void;
};

type Settled<T> = {
  /** The `load` function and nonce this outcome belongs to. */
  load: unknown;
  nonce: number;
  data: T | null;
  error: string | null;
};

export function useAsync<T>(load: (() => Promise<T>) | null): AsyncState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!load) {
      return;
    }

    let cancelled = false;

    load()
      .then((data) => {
        if (cancelled) return;
        setSettled({ load, nonce, data, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // Keeps whatever was last loaded: a failed reload should show its error
        // over the previous view, not replace the page with nothing.
        setSettled((previous) => ({
          load,
          nonce,
          data: previous?.data ?? null,
          error: cause instanceof Error ? cause.message : String(cause),
        }));
      });

    // A page can be left before its fetch resolves; without this the resolved
    // handler would set state on an unmounted component.
    return () => {
      cancelled = true;
    };
  }, [load, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  // Fresh means "produced by the attempt currently in effect".
  const fresh = settled !== null && settled.load === load && settled.nonce === nonce;

  return {
    // A previously loaded value survives both a reload and a failure; only a
    // fresh error is reported, so the error note clears while a retry is running.
    data: settled?.data ?? null,
    error: fresh ? settled.error : null,
    loading: load !== null && !fresh,
    reload,
  };
}
