// The five-county area the map is locked to: Fulton, DeKalb, Cobb, Gwinnett, and Clayton.
// Measured from the Census county outlines in counties.geo.json
// (33.3525–34.1862 N, 84.8507–83.7991 W), plus a small margin so the edges aren't flush.

export const LIMITS = { south: 33.34, north: 34.2, west: -84.86, east: -83.79 } as const;

export const MIN_ZOOM = 9;    // whole area
export const MAX_ZOOM = 16;   // a few city blocks

/** Zoomed out over the whole area, centered on the middle of the five counties. */
export const START_VIEW: MapView = {
  center: [(LIMITS.west + LIMITS.east) / 2, (LIMITS.south + LIMITS.north) / 2],
  zoom: MIN_ZOOM,
};

export interface MapView {
  center: [number, number];   // [lng, lat]
  zoom: number;
}

export function inLimits(lat: number, lng: number) {
  return lat >= LIMITS.south && lat <= LIMITS.north && lng >= LIMITS.west && lng <= LIMITS.east;
}
