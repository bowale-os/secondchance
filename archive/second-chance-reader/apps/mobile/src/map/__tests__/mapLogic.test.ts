import { describe, expect, it } from 'vitest';
import type { Category, Place } from '@scr/shared';
import sample from '../data/sample-places.json';
import { LIMITS, MAX_ZOOM, MIN_ZOOM } from '../geo/bounds';
import { clampView, controlState, panView, startView, visibleBounds, zoomInOn, zoomView, type Size } from '../geo/viewMath';
import { COUNTY_SHAPES, countyAt } from '../geo/counties';
import { mapItems, groupIntoSites } from '../logic/pins';
import { applyFilters, filterSummary, parseFilters } from '../logic/filters';

const { categories, places } = sample as { categories: Category[]; places: Place[] };
const phone: Size = { width: 375, height: 420 };
const desktop: Size = { width: 1200, height: 700 };

const within = (b: ReturnType<typeof visibleBounds>) =>
  b.west >= LIMITS.west - 1e-6 && b.east <= LIMITS.east + 1e-6 && b.south >= LIMITS.south - 1e-6 && b.north <= LIMITS.north + 1e-6;

describe('county outlines', () => {
  it('has all five counties, and Atlanta landmarks fall in the right one', () => {
    expect(COUNTY_SHAPES.map(c => c.id).sort()).toEqual(['clayton', 'cobb', 'dekalb', 'fulton', 'gwinnett']);
    expect(countyAt(33.749, -84.388)).toBe('fulton');     // downtown Atlanta
    expect(countyAt(33.774, -84.296)).toBe('dekalb');     // Decatur
    expect(countyAt(33.952, -84.55)).toBe('cobb');        // Marietta
    expect(countyAt(33.956, -83.988)).toBe('gwinnett');   // Lawrenceville
    expect(countyAt(33.521, -84.354)).toBe('clayton');    // Jonesboro
    expect(countyAt(33.95, -83.38)).toBeNull();           // Athens: outside the five
  });

  it('every sample place sits inside the county it says it is in', () => {
    for (const p of places) expect(countyAt(p.location.lat, p.location.lng), p.id).toBe(p.county);
  });
});

describe('moving and zooming', () => {
  it('starts zoomed out over the whole area', () => {
    expect(startView(phone).zoom).toBe(MIN_ZOOM);
    expect(startView(desktop).zoom).toBe(MIN_ZOOM);
  });

  it('takes 7 presses of + from the start to the closest zoom, then stops', () => {
    let v = startView(phone);
    for (let i = 0; i < 7; i++) v = zoomView(v, 1, phone);
    expect(v.zoom).toBe(MAX_ZOOM);
    expect(controlState(v, phone).canZoomIn).toBe(false);
    expect(zoomView(v, 1, phone).zoom).toBe(MAX_ZOOM);
    expect(controlState(startView(phone), phone).canZoomOut).toBe(false);
  });

  it('keeps the center in place when zooming (away from the edges)', () => {
    const v = clampView({ center: [-84.39, 33.75], zoom: 12 }, phone);
    const z = zoomView(v, 1, phone);
    expect(z.center[0]).toBeCloseTo(-84.39, 6);
    expect(z.center[1]).toBeCloseTo(33.75, 6);
  });

  it('moves one third of the visible map per press', () => {
    const v = clampView({ center: [-84.39, 33.75], zoom: 13 }, phone);
    const before = visibleBounds(v, phone);
    const after = visibleBounds(panView(v, 'right', phone), phone);
    expect(after.west - before.west).toBeCloseTo((before.east - before.west) / 3, 6);
  });

  it('never shows anything outside the five counties once zoomed in', () => {
    let v = clampView({ center: [-84.39, 33.75], zoom: 12 }, phone);
    for (let i = 0; i < 40; i++) v = panView(v, 'left', phone);
    expect(within(visibleBounds(v, phone))).toBe(true);
    expect(controlState(v, phone).canPan.left).toBe(false);
    expect(controlState(v, phone).canPan.right).toBe(true);
    for (let i = 0; i < 40; i++) v = panView(v, 'up', phone);
    expect(controlState(v, phone).canPan.up).toBe(false);
    expect(within(visibleBounds(v, phone))).toBe(true);
  });

  it('cannot move at all when the whole area already fits on screen', () => {
    const c = controlState(startView(desktop), desktop);
    expect(c.canPan).toEqual({ up: false, down: false, left: false, right: false });
    expect(c.atStart).toBe(true);
  });

  it('zooms in one level on a tapped circle', () => {
    const v = zoomInOn(startView(phone), -84.388, 33.749, phone);
    expect(v.zoom).toBe(MIN_ZOOM + 1);
  });
});

describe('pins', () => {
  it('shows a courthouse holding two courts as one pin listing both', () => {
    const sites = groupIntoSites(places);
    const court = sites.find(s => s.places.some(p => p.id === 'sample-courts-1b'))!;
    expect(court.places.map(p => p.id).sort()).toEqual(['sample-courts-1', 'sample-courts-1b']);
    expect(sites).toHaveLength(places.length - 1);
  });

  it('merges nearby pins into numbered circles below zoom 13, and not from 13 up', () => {
    const far = mapItems(places, 9);
    expect(far.some(i => i.kind === 'cluster')).toBe(true);
    expect(far.reduce((n, i) => n + (i.kind === 'cluster' ? i.count : i.places.length), 0)).toBe(places.length);
    expect(mapItems(places, 13).every(i => i.kind === 'site')).toBe(true);
  });

  it('groups the same way every time', () => {
    expect(mapItems(places, 10).map(i => i.key)).toEqual(mapItems([...places].reverse(), 10).map(i => i.key));
  });
});

describe('filters', () => {
  const tuesday10am = new Date('2026-10-13T10:00:00-04:00');
  const saturday9pm = new Date('2026-10-10T21:00:00-04:00');

  it('starts with everything on and counts "Filters: N of 10"', () => {
    expect(filterSummary(categories, parseFilters(null)).label).toBe('Filters: 10 of 10');
    expect(filterSummary(categories, { hidden: ['courts', 'food'], openNow: false }).label).toBe('Filters: 8 of 10');
  });

  it('hides turned-off categories', () => {
    const shown = applyFilters(places, { hidden: ['courts'], openNow: false }, tuesday10am);
    expect(shown.some(p => p.categoryId === 'courts')).toBe(false);
  });

  it('"Open now" hides closed places, including temporarily closed ones', () => {
    const night = applyFilters(places, { hidden: [], openNow: true }, saturday9pm);
    expect(night.every(p => p.categoryId === 'housing_shelter')).toBe(true);   // only 24-hour shelters
    const day = applyFilters(places, { hidden: [], openNow: true }, tuesday10am);
    expect(day.find(p => p.id === 'sample-food-2')).toBeUndefined();
    expect(applyFilters(places, { hidden: [], openNow: false }, tuesday10am).find(p => p.id === 'sample-food-2')).toBeDefined();
  });

  it('survives damaged saved settings', () => {
    expect(parseFilters('{not json')).toEqual({ hidden: [], openNow: false });
    expect(parseFilters('{"hidden":["courts",3],"openNow":"yes"}')).toEqual({ hidden: ['courts'], openNow: false });
  });
});
