import { useCallback, useState } from 'react';

const STORAGE_KEY = 'webdev-crm.pageSize';
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

/**
 * Rows-per-page for a paginated table, remembered between visits. Falls back to
 * the default if the stored value is missing or no longer an allowed option.
 */
export function usePageSize() {
  const [pageSize, setStoredPageSize] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(STORAGE_KEY));
      return PAGE_SIZE_OPTIONS.includes(stored) ? stored : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });

  const setPageSize = useCallback((next) => {
    const value = PAGE_SIZE_OPTIONS.includes(Number(next)) ? Number(next) : DEFAULT_PAGE_SIZE;
    setStoredPageSize(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      /* storage can be unavailable, the choice just will not persist */
    }
  }, []);

  return [pageSize, setPageSize];
}

export default usePageSize;
