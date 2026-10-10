// County outlines from the US Census Bureau (public domain), five metro Atlanta counties.
// Regenerate with apps/mobile/scripts/extract-counties.py.
import type { County } from '@scr/shared';
import data from './counties.geo.json';

export interface CountyShape {
  id: County;
  name: string;
  /** MultiPolygon: polygons → rings → [lng, lat] points. */
  polygons: [number, number][][][];
}

export const COUNTY_SHAPES: CountyShape[] = (data as unknown as {
  features: { properties: { id: County; name: string }; geometry: { coordinates: [number, number][][][] } }[];
}).features.map(f => ({ id: f.properties.id, name: f.properties.name, polygons: f.geometry.coordinates }));

/** Even-odd ray casting on the outer ring of each polygon. */
export function countyAt(lat: number, lng: number): County | null {
  for (const c of COUNTY_SHAPES) {
    for (const [ring] of c.polygons) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return c.id;
    }
  }
  return null;
}

/** A label spot for each county: the center of its outline's bounding box. */
export function countyLabelPoint(c: CountyShape): [number, number] {
  const pts = c.polygons.flatMap(p => p[0]);
  const lngs = pts.map(p => p[0]);
  const lats = pts.map(p => p[1]);
  return [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}
