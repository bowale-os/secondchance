// Which places show: chosen categories, plus the "Open now" toggle.
import { isOpenNow, type Category, type Place } from '@scr/shared';

export interface FilterState {
  /** Category ids that are turned off. Stored as "off" so new categories start on. */
  hidden: string[];
  openNow: boolean;
}

export const DEFAULT_FILTERS: FilterState = { hidden: [], openNow: false };

export function applyFilters(places: Place[], f: FilterState, now: Date) {
  const hidden = new Set(f.hidden);
  return places.filter(p =>
    !hidden.has(p.categoryId) && (!f.openNow || isOpenNow(p, now).state !== 'closed'));
}

/** "Filters: 4 of 10" */
export function filterSummary(categories: Category[], f: FilterState) {
  const on = categories.filter(c => !f.hidden.includes(c.id)).length;
  return { on, total: categories.length, label: `Filters: ${on} of ${categories.length}` };
}

/** Count of places per category for the filter panel ("Courts — 18"), ignoring the category filter. */
export function countsByCategory(places: Place[]) {
  const counts: Record<string, number> = {};
  for (const p of places) counts[p.categoryId] = (counts[p.categoryId] ?? 0) + 1;
  return counts;
}

export function parseFilters(raw: string | null): FilterState {
  if (!raw) return DEFAULT_FILTERS;
  try {
    const v = JSON.parse(raw) as Partial<FilterState>;
    return { hidden: Array.isArray(v.hidden) ? v.hidden.filter(x => typeof x === 'string') : [], openNow: v.openNow === true };
  } catch {
    return DEFAULT_FILTERS;
  }
}
