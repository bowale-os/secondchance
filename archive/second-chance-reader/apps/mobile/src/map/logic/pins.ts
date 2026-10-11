// Turns places into what the map draws: one pin per building, and below zoom 13,
// numbered circles for pins that would overlap.
import type { Place } from '@scr/shared';
import { project } from '../geo/viewMath';

export const CLUSTER_BELOW_ZOOM = 13;
/** Pins closer than this on screen merge into a numbered circle (pins are 40 px across). */
export const CLUSTER_RADIUS_PX = 48;
/** Places within about 10 m are treated as one building (a courthouse holding several courts). */
const SAME_BUILDING_DEG = 0.0001;

export interface Site {
  kind: 'site';
  key: string;
  lat: number;
  lng: number;
  places: Place[];         // more than one when several offices share a building
}

export interface Cluster {
  kind: 'cluster';
  key: string;
  lat: number;
  lng: number;
  count: number;           // number of places, not buildings
  sites: Site[];
}

export type MapItem = Site | Cluster;

export function groupIntoSites(places: Place[]): Site[] {
  const sites: Site[] = [];
  for (const p of places) {
    const site = sites.find(s =>
      Math.abs(s.lat - p.location.lat) < SAME_BUILDING_DEG && Math.abs(s.lng - p.location.lng) < SAME_BUILDING_DEG);
    if (site) site.places.push(p);
    else sites.push({ kind: 'site', key: p.id, lat: p.location.lat, lng: p.location.lng, places: [p] });
  }
  // Name each site by its smallest place id and sort, so the result doesn't depend on
  // the order places arrived in (pins mustn't shuffle between refreshes).
  for (const s of sites) {
    s.places.sort((a, b) => a.name.localeCompare(b.name));
    s.key = s.places.map(p => p.id).sort()[0];
  }
  return sites.sort((a, b) => a.key.localeCompare(b.key));
}

/** Greedy screen-space grouping; deterministic so pins don't jump between renders. */
export function mapItems(places: Place[], zoom: number): MapItem[] {
  const sites = groupIntoSites(places);
  if (zoom >= CLUSTER_BELOW_ZOOM) return sites;

  const remaining = sites.map(s => ({ s, px: project(s.lng, s.lat, zoom) }));
  const items: MapItem[] = [];
  while (remaining.length) {
    const seed = remaining.shift()!;
    const group = [seed];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const r = remaining[i];
      if (Math.hypot(r.px[0] - seed.px[0], r.px[1] - seed.px[1]) < CLUSTER_RADIUS_PX) {
        group.push(r);
        remaining.splice(i, 1);
      }
    }
    if (group.length === 1) {
      items.push(seed.s);
    } else {
      const groupSites = group.map(g => g.s);
      items.push({
        kind: 'cluster',
        key: `c:${groupSites.map(s => s.key).sort().join('|')}`,
        lat: groupSites.reduce((t, s) => t + s.lat, 0) / groupSites.length,
        lng: groupSites.reduce((t, s) => t + s.lng, 0) / groupSites.length,
        count: groupSites.reduce((t, s) => t + s.places.length, 0),
        sites: groupSites,
      });
    }
  }
  return items;
}
