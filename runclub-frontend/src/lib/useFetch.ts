import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Small fetch-on-mount hook. `fn` must be stable (wrap it in useCallback);
 * it is part of the effect's dependency list.
 */
export function useFetch<T>(fn: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });

  const run = useCallback(
    async (signal?: { cancelled: boolean }) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await fn();
        if (signal?.cancelled) return;
        setState({ data, loading: false, error: null });
      } catch (err) {
        if (signal?.cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unexpected error";
        setState({ data: null, loading: false, error: message });
      }
    },
    [fn],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void run(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [run]);

  const reload = useCallback(() => void run(), [run]);

  /** Optimistic local update without a round-trip. */
  const setData = useCallback((updater: (prev: T | null) => T | null) => {
    setState((s) => ({ ...s, data: updater(s.data) }));
  }, []);

  return { ...state, reload, setData };
}
