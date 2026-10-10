import { describe, expect, it } from 'vitest';
import type { Category, Place } from '@scr/shared';
import sample from '../data/sample-places.json';
import { inLimits } from '../geo/bounds';

const { categories, places } = sample as { categories: Category[]; places: Place[] };

describe('bundled sample places', () => {
  it('are all clearly fake', () => {
    for (const p of places) {
      expect(p.isSample).toBe(true);
      expect(p.name.startsWith('SAMPLE — ')).toBe(true);
      expect(p.address.street).toMatch(/Sample/);
      expect(p.phone).toMatch(/^404-555-01\d\d$/);   // 555-0100–0199 is reserved for fiction
    }
  });

  it('sit inside the five-county map limits', () => {
    for (const p of places) expect(inLimits(p.location.lat, p.location.lng), p.id).toBe(true);
  });

  it('cover every category and every county, with unique ids', () => {
    expect(categories).toHaveLength(10);
    for (const c of categories) expect(places.some(p => p.categoryId === c.id), c.id).toBe(true);
    expect(new Set(places.map(p => p.county))).toEqual(new Set(['fulton', 'dekalb', 'cobb', 'gwinnett', 'clayton']));
    expect(new Set(places.map(p => p.id)).size).toBe(places.length);
  });

  it('have valid hours (HH:MM, open before close)', () => {
    for (const p of places) {
      for (const h of p.hours) {
        expect(h.open).toMatch(/^\d\d:\d\d$/);
        expect(h.close > h.open, p.id).toBe(true);
      }
    }
  });
});
