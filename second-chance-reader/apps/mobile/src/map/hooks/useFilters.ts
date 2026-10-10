// Chosen categories and "Open now", remembered on this device.
import { useCallback, useEffect, useState } from 'react';
import type { MetaStore } from '../data/PlaceRepository';
import { DEFAULT_FILTERS, parseFilters, type FilterState } from '../logic/filters';

const KEY = 'map.filters';

export function useFilters(store: MetaStore) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  useEffect(() => {
    store.getMeta(KEY).then(raw => setFilters(parseFilters(raw)));
  }, [store]);

  // Each change builds on the latest state, so two changes in one tap (Show all + Open now
  // off) both stick.
  const update = useCallback((change: (prev: FilterState) => FilterState) => {
    setFilters(prev => {
      const next = change(prev);
      void store.setMeta(KEY, JSON.stringify(next));
      return next;
    });
  }, [store]);

  return {
    filters,
    toggleCategory: (id: string) => update(f => ({
      ...f,
      hidden: f.hidden.includes(id) ? f.hidden.filter(h => h !== id) : [...f.hidden, id],
    })),
    showAll: () => update(f => ({ ...f, hidden: [] })),
    hideAll: (categoryIds: string[]) => update(f => ({ ...f, hidden: categoryIds })),
    setOpenNow: (openNow: boolean) => update(f => ({ ...f, openNow })),
  };
}
