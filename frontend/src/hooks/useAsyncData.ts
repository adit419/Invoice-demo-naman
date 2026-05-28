/**
 * Generic "load once / show loader / surface errors / expose reload" hook.
 *
 * Several stage pages hand-rolled the identical shape:
 *
 *   const [data, setData]       = useState<T | null>(null);
 *   const [loading, setLoading] = useState(true);
 *   const loadData = useCallback(async () => {
 *     if (!id) return;
 *     try { setData(await fetch()); }
 *     catch { toast("Failed to load …", "error"); }
 *     finally { setLoading(false); }
 *   }, [id]);
 *   useEffect(() => { loadData(); }, [loadData]);
 *
 * `useAsyncData` is that, once. Pass a `fetcher` memoised over its real
 * dependencies (e.g. the route `id`); returning `null` from it means "not
 * ready yet" — the call is skipped and the loader stays up, exactly as the
 * inline `if (!id) return` guards did. The fetch re-runs whenever `fetcher`'s
 * identity changes, mirroring the old `useCallback([id])` + effect pair.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface UseAsyncDataResult<T> {
  data: T | null;
  loading: boolean;
  /** Re-run the fetcher (e.g. after a mutation). Does not toggle `loading`. */
  reload: () => Promise<void>;
}

export function useAsyncData<T>(
  fetcher: () => Promise<T> | null,
  onError?: (err: unknown) => void,
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep the latest onError without making it a fetch dependency (callers
  // pass fresh closures every render — depending on it would loop).
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const run = useCallback(
    async (firstLoad: boolean) => {
      const promise = fetcher();
      if (!promise) return;
      try {
        setData(await promise);
      } catch (err) {
        onErrorRef.current?.(err);
      } finally {
        if (firstLoad) setLoading(false);
      }
    },
    [fetcher],
  );

  useEffect(() => { run(true); }, [run]);

  const reload = useCallback(() => run(false), [run]);

  return { data, loading, reload };
}
