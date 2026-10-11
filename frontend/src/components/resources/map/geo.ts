// Ported from archive/second-chance-reader/apps/mobile/src/map/geo (bounds.ts, viewMath.ts, counties.ts).
// The map is locked to the five core metro Atlanta counties. All math is in Web Mercator
// pixels (the projection MapLibre uses). Our zoom levels count 256-px tiles; MapLibre counts
// 512-px tiles, so MapLibre's zoom is ours minus one.
import type { Feature, FeatureCollection, Polygon } from "geojson";
import data from "./counties.geo.json";

/** Measured from the Census outlines (33.3525–34.1862 N, 84.8507–83.7991 W), plus a small margin. */
export const LIMITS = { south: 33.34, north: 34.2, west: -84.86, east: -83.79 } as const;

export const MIN_ZOOM = 9; // whole area
export const MAX_ZOOM = 16; // a few city blocks

export interface MapView {
  center: [number, number]; // [lng, lat]
  zoom: number;
}

export type PanDirection = "up" | "down" | "left" | "right";
export interface Size {
  width: number;
  height: number;
}

/** Middle of the five counties; used when there's no client address or office. */
export const AREA_CENTER = { lat: (LIMITS.south + LIMITS.north) / 2, lng: (LIMITS.west + LIMITS.east) / 2 };

export const inLimits = (lat: number, lng: number) =>
  lat >= LIMITS.south && lat <= LIMITS.north && lng >= LIMITS.west && lng <= LIMITS.east;

const TILE = 256;
const worldSize = (zoom: number) => TILE * 2 ** zoom;

export function project(lng: number, lat: number, zoom: number): [number, number] {
  const s = worldSize(zoom);
  const sin = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
}

export function unproject(x: number, y: number, zoom: number): [number, number] {
  const s = worldSize(zoom);
  const lng = (x / s) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) * 180) / Math.PI;
  return [lng, lat];
}

/**
 * Keeps the view inside the five counties. Along any direction where the whole area
 * already fits on screen, the view is centered on the area instead.
 */
export function clampView(view: MapView, size: Size): MapView {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(view.zoom)));
  const [left, top] = project(LIMITS.west, LIMITS.north, zoom);
  const [right, bottom] = project(LIMITS.east, LIMITS.south, zoom);
  let [x, y] = project(view.center[0], view.center[1], zoom);
  const halfW = size.width / 2;
  const halfH = size.height / 2;

  x = right - left <= size.width ? (left + right) / 2 : Math.min(right - halfW, Math.max(left + halfW, x));
  y = bottom - top <= size.height ? (top + bottom) / 2 : Math.min(bottom - halfH, Math.max(top + halfH, y));
  return { center: unproject(x, y, zoom), zoom };
}

/** One press = one third of the visible map, stopping at the edge of the five counties. */
export function panView(view: MapView, dir: PanDirection, size: Size): MapView {
  const [x, y] = project(view.center[0], view.center[1], view.zoom);
  const dx = size.width / 3;
  const dy = size.height / 3;
  const [nx, ny] = ({ up: [x, y - dy], down: [x, y + dy], left: [x - dx, y], right: [x + dx, y] } as const)[dir];
  return clampView({ center: unproject(nx, ny, view.zoom), zoom: view.zoom }, size);
}

/** One level per press, keeping the center point in place. */
export const zoomView = (view: MapView, by: 1 | -1, size: Size): MapView =>
  clampView({ center: view.center, zoom: view.zoom + by }, size);

/** Zoom in one level on a point (tapping a numbered circle). */
export const zoomInOn = (view: MapView, lng: number, lat: number, size: Size): MapView =>
  clampView({ center: [lng, lat], zoom: view.zoom + 1 }, size);

const samePlace = (a: MapView, b: MapView) =>
  Math.round(a.zoom) === Math.round(b.zoom) &&
  Math.abs(a.center[0] - b.center[0]) < 1e-6 &&
  Math.abs(a.center[1] - b.center[1]) < 1e-6;

/** Which buttons do anything right now (the rest are disabled). */
export function controlState(view: MapView, start: MapView, size: Size) {
  const can = (dir: PanDirection) => !samePlace(panView(view, dir, size), view);
  return {
    canZoomIn: view.zoom < MAX_ZOOM,
    canZoomOut: view.zoom > MIN_ZOOM,
    canPan: { up: can("up"), down: can("down"), left: can("left"), right: can("right") },
    atStart: samePlace(start, view),
  };
}

// ---------- Counties ----------

export interface CountyShape {
  id: string;
  name: string;
  /** MultiPolygon: polygons → rings → [lng, lat] points. */
  polygons: [number, number][][][];
}

export const COUNTIES_GEOJSON = data as unknown as FeatureCollection;

export const COUNTY_SHAPES: CountyShape[] = (
  data as unknown as {
    features: { properties: { id: string; name: string }; geometry: { coordinates: [number, number][][][] } }[];
  }
).features.map((f) => ({ id: f.properties.id, name: f.properties.name, polygons: f.geometry.coordinates }));

/** A label spot for each county: the center of its outline's bounding box. */
export function countyLabelPoint(c: CountyShape): [number, number] {
  const pts = c.polygons.flatMap((p) => p[0]);
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}

/** A circle as a 64-point polygon, for the 1-mile transit ring. */
export function circlePolygon(lat: number, lng: number, radiusM: number): Feature<Polygon> {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}
