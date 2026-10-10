// Center and zoom, moved only by buttons (or arrow / + / – keys on shared computers).
// One press = one step; the view can never leave the five counties.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MapView } from '../geo/bounds';
import {
  clampView, controlState, panView, startView, zoomInOn, zoomView, type PanDirection, type Size,
} from '../geo/viewMath';

export function useMapView(size: Size) {
  const [view, setView] = useState<MapView>(() => startView(size));

  // Re-fit when the screen size changes (rotation, window resize).
  useEffect(() => { setView(v => clampView(v, size)); }, [size.width, size.height]);

  const zoomIn = useCallback(() => setView(v => zoomView(v, 1, size)), [size]);
  const zoomOut = useCallback(() => setView(v => zoomView(v, -1, size)), [size]);
  const pan = useCallback((dir: PanDirection) => setView(v => panView(v, dir, size)), [size]);
  const reset = useCallback(() => setView(startView(size)), [size]);
  const focus = useCallback((lng: number, lat: number, zoom: number) =>
    setView(clampView({ center: [lng, lat], zoom }, size)), [size]);
  const zoomInAt = useCallback((lng: number, lat: number) => setView(v => zoomInOn(v, lng, lat, size)), [size]);

  const controls = useMemo(() => controlState(view, size), [view, size]);
  return { view, zoomIn, zoomOut, pan, reset, focus, zoomInAt, ...controls };
}
