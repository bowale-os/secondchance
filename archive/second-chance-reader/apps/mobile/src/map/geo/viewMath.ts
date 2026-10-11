// Moving and zooming the map with buttons only. All math is in Web Mercator pixels (the
// projection MapLibre uses), so one press moves exactly a third of what's on screen.
import { LIMITS, MAX_ZOOM, MIN_ZOOM, START_VIEW, type MapView } from './bounds';

export type PanDirection = 'up' | 'down' | 'left' | 'right';
export interface Size { width: number; height: number }

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

/** What part of the map is on screen. */
export function visibleBounds(view: MapView, size: Size) {
  const [cx, cy] = project(view.center[0], view.center[1], view.zoom);
  const [west, north] = unproject(cx - size.width / 2, cy - size.height / 2, view.zoom);
  const [east, south] = unproject(cx + size.width / 2, cy + size.height / 2, view.zoom);
  return { west, east, south, north };
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
  const [nx, ny] = {
    up: [x, y - dy], down: [x, y + dy], left: [x - dx, y], right: [x + dx, y],
  }[dir] as [number, number];
  return clampView({ center: unproject(nx, ny, view.zoom), zoom: view.zoom }, size);
}

/** One level per press, keeping the center point in place. */
export function zoomView(view: MapView, by: 1 | -1, size: Size): MapView {
  return clampView({ center: view.center, zoom: view.zoom + by }, size);
}

/** Zoom in one level on a point (tapping a numbered circle). */
export function zoomInOn(view: MapView, lng: number, lat: number, size: Size): MapView {
  return clampView({ center: [lng, lat], zoom: view.zoom + 1 }, size);
}

const samePlace = (a: MapView, b: MapView) =>
  a.zoom === b.zoom && Math.abs(a.center[0] - b.center[0]) < 1e-9 && Math.abs(a.center[1] - b.center[1]) < 1e-9;

/** Which buttons do anything right now (the rest turn gray). */
export function controlState(view: MapView, size: Size) {
  const can = (dir: PanDirection) => !samePlace(panView(view, dir, size), view);
  return {
    canZoomIn: view.zoom < MAX_ZOOM,
    canZoomOut: view.zoom > MIN_ZOOM,
    canPan: { up: can('up'), down: can('down'), left: can('left'), right: can('right') },
    atStart: samePlace(clampView(START_VIEW, size), view),
  };
}

export function startView(size: Size) {
  return clampView(START_VIEW, size);
}
