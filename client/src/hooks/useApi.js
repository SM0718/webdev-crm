import { useCallback, useEffect, useState } from 'react';

import { toMessage } from '@/lib/api';

/**
 * Small data-fetching hook used by every page.
 * Keeps a stable `reload` so effects can re-run after mutations.
 */
export function useApi(fetcher, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(immediate);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);
      try {
        const response = await fetcher();
        setData(response.data);
        return response.data;
      } catch (err) {
        setError(toMessage(err));
        return null;
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    if (immediate) load();
  }, [load, immediate]);

  return { data, error, isLoading, isRefreshing, reload: load, setData };
}

export default useApi;
