// Web map ported from second-chance-reader's MapCanvas.web.tsx: MapLibre draws the county
// outlines (no tile server); pins are real <button>s positioned with map.project(), so they
// can be tabbed to, opened with Enter, and read by screen readers. Buttons and arrow / + / –
// keys move the map for everyone; staff can also drag, scroll and pinch (`gestures`).
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { LatLng, TransitStop } from "../../../types";
import { CATEGORY_LABELS } from "../labels";
import {
  COUNTIES_GEOJSON,
  COUNTY_SHAPES,
  LIMITS,
  MAX_ZOOM,
  MIN_ZOOM,
  circlePolygon,
  clampView,
  controlState,
  countyLabelPoint,
  panView,
  zoomInOn,
  zoomView,
  type MapView,
  type PanDirection,
  type Size,
} from "./geo";
import { mapItems, type MapMarker, type Site } from "./pins";
import { CATEGORY_COLORS, CATEGORY_LETTERS, MAP_COLORS } from "./theme";
import "./map.css";

export type { MapMarker } from "./pins";

export interface ResourceMapProps {
  markers: MapMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Client address or office; the middle of the five counties when there's neither. */
  center: LatLng;
  /** Draws `stops` and a 1-mile ring around `center`. */
  showTransit?: boolean;
  stops?: TransitStop[];
  /** Staff: drag, scroll-wheel and pinch as well as the buttons. */
  gestures?: boolean;
  /** Small map in the drawer: zoom buttons only. */
  compact?: boolean;
  /** In our zoom units (256-px tiles); 9 shows all five counties. */
  startZoom?: number;
  /** Accessible name for the map region, e.g. "Map of 24 resources". */
  label: string;
}

const NAME_LABELS_FROM_ZOOM = 14;
/** Pins this far past the edge are left out, so Tab and screen readers only reach what shows. */
const EDGE_SLACK = 24;
const ONE_MILE_M = 1609;

const toMapLibreZoom = (zoom: number) => zoom - 1;

export default function ResourceMap({
  markers,
  selectedId,
  onSelect,
  center,
  showTransit = false,
  stops = [],
  gestures = false,
  compact = false,
  startZoom = MIN_ZOOM,
  label,
}: ResourceMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [, setFrame] = useState(0); // re-render pins as the camera moves
  const start = useMemo(
    () => clampView({ center: [center.lng, center.lat], zoom: startZoom }, size),
    [center.lng, center.lat, startZoom, size]
  );
  const [view, setView] = useState<MapView>(start);
  const [openSite, setOpenSite] = useState<Site | null>(null);

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const ring = showTransit ? circlePolygon(center.lat, center.lng, ONE_MILE_M) : null;
    const m = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: {
          counties: { type: "geojson", data: COUNTIES_GEOJSON },
          ...(ring && { ring: { type: "geojson", data: ring } }),
        },
        layers: [
          { id: "outside", type: "background", paint: { "background-color": MAP_COLORS.outside } },
          { id: "county-fill", type: "fill", source: "counties", paint: { "fill-color": MAP_COLORS.land } },
          { id: "county-line", type: "line", source: "counties", paint: { "line-color": MAP_COLORS.countyLine, "line-width": 2 } },
          ...(ring
            ? ([
                { id: "ring-fill", type: "fill", source: "ring", paint: { "fill-color": MAP_COLORS.transit, "fill-opacity": 0.08 } },
                {
                  id: "ring-line",
                  type: "line",
                  source: "ring",
                  paint: { "line-color": MAP_COLORS.transit, "line-width": 2, "line-dasharray": [2, 2] },
                },
              ] as maplibregl.LayerSpecification[])
            : []),
        ],
      },
      center: [start.center[0], start.center[1]],
      zoom: toMapLibreZoom(start.zoom),
      minZoom: toMapLibreZoom(MIN_ZOOM),
      maxZoom: toMapLibreZoom(MAX_ZOOM),
      maxBounds: [
        [LIMITS.west - 0.1, LIMITS.south - 0.1],
        [LIMITS.east + 0.1, LIMITS.north + 0.1],
      ],
      interactive: gestures,
      attributionControl: false,
      renderWorldCopies: false,
    });
    if (gestures) {
      m.dragRotate.disable();
      m.touchZoomRotate.disableRotation();
      m.keyboard.disable(); // our own key handler moves by the same steps as the buttons
    }
    const redraw = () => setFrame((f) => f + 1);
    m.on("move", redraw);
    m.on("load", redraw);
    // After a drag or scroll, the buttons work from wherever the map ended up.
    m.on("moveend", () => {
      const c = m.getCenter();
      setView({ center: [c.lng, c.lat], zoom: m.getZoom() + 1 });
    });
    mapRef.current = m;

    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      m.resize();
    });
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      m.remove();
      mapRef.current = null;
    };
    // The map is built once; markers and view changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First real size: start view. After that (window resize, phone rotation): keep the view, re-fit it.
  const fitted = useRef(false);
  useEffect(() => {
    if (!size.width) return;
    if (fitted.current) {
      setView((v) => clampView(v, size));
    } else {
      fitted.current = true;
      setView(start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  // Button and key moves: ease the camera to the new view (no-op if a gesture already put it there).
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const c = m.getCenter();
    const same =
      Math.abs(c.lng - view.center[0]) < 1e-7 && Math.abs(c.lat - view.center[1]) < 1e-7 && Math.abs(m.getZoom() + 1 - view.zoom) < 1e-3;
    if (same) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    m.easeTo({ center: view.center, zoom: toMapLibreZoom(view.zoom), duration: reduceMotion ? 0 : 300 });
  }, [view]);

  const m = mapRef.current;
  const liveZoom = m ? m.getZoom() + 1 : view.zoom;
  const clusterZoom = Math.round(liveZoom);
  const items = useMemo(() => mapItems(markers, clusterZoom), [markers, clusterZoom]);
  const controls = controlState(view, start, size);

  const at = (lng: number, lat: number) => {
    const p = m ? m.project([lng, lat]) : { x: -999, y: -999 };
    return { left: p.x, top: p.y };
  };
  const onScreen = (lng: number, lat: number) => {
    const { left, top } = at(lng, lat);
    return left >= -EDGE_SLACK && top >= -EDGE_SLACK && left <= size.width + EDGE_SLACK && top <= size.height + EDGE_SLACK;
  };

  const pan = (dir: PanDirection) => setView((v) => panView(v, dir, size));
  const zoom = (by: 1 | -1) => setView((v) => zoomView(v, by, size));
  const reset = () => setView(start);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, () => void> = {
      ArrowUp: () => pan("up"),
      ArrowDown: () => pan("down"),
      ArrowLeft: () => pan("left"),
      ArrowRight: () => pan("right"),
      "+": () => zoom(1),
      "=": () => zoom(1),
      "-": () => zoom(-1),
      Home: reset,
    };
    const action = keys[e.key];
    if (!action || (compact && e.key.startsWith("Arrow"))) return;
    e.preventDefault();
    action();
  }

  function selectSite(site: Site) {
    if (site.markers.length === 1) {
      setOpenSite(null);
      onSelect(site.markers[0].id);
    } else {
      setOpenSite(site);
    }
  }

  return (
    <div className={`res-map${compact ? " res-map-compact" : ""}`}>
      <div
        className="res-map-frame"
        role="region"
        aria-label={label}
        aria-describedby={compact ? undefined : "res-map-keys"}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div ref={container} className="res-map-canvas" aria-hidden="true" />
        <div className="res-map-overlay">
          {m &&
            !compact &&
            COUNTY_SHAPES.map((c) => {
              const [lng, lat] = countyLabelPoint(c);
              return (
                <span key={c.id} className="res-map-county" style={at(lng, lat)} aria-hidden="true">
                  {c.name}
                </span>
              );
            })}

          {m &&
            showTransit &&
            stops
              .filter((s) => onScreen(s.lng, s.lat))
              .map((s) => (
                <span key={s.stop_name} className="res-map-stop" style={at(s.lng, s.lat)} title={s.stop_name} aria-hidden="true">
                  <span className="res-map-stop-dot" />
                  <span className="res-map-stop-name">{s.stop_name}</span>
                </span>
              ))}

          {m &&
            items
              .filter((item) => onScreen(item.lng, item.lat))
              .map((item) =>
                item.kind === "cluster" ? (
                  <button
                    key={item.key}
                    type="button"
                    className="res-map-cluster"
                    style={at(item.lng, item.lat)}
                    aria-label={`${item.count} resources here. Zooms in.`}
                    onClick={() => setView((v) => zoomInOn(v, item.lng, item.lat, size))}
                  >
                    {item.count}
                  </button>
                ) : (
                  <SitePin
                    key={item.key}
                    site={item}
                    selected={item.markers.some((mk) => mk.id === selectedId)}
                    showName={liveZoom >= NAME_LABELS_FROM_ZOOM && !compact}
                    position={at(item.lng, item.lat)}
                    onPress={() => selectSite(item)}
                  />
                )
              )}
        </div>
      </div>

      {openSite && (
        <div className="res-map-site" role="group" aria-label={`${openSite.markers.length} resources in one building`}>
          <p>{openSite.markers.length} resources in this building:</p>
          <ul>
            {openSite.markers.map((mk) => (
              <li key={mk.id}>
                <button type="button" className="dash-btn dash-btn-quiet" onClick={() => onSelect(mk.id)}>
                  {mk.name} <span className="res-muted">· {CATEGORY_LABELS[mk.category]}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setOpenSite(null)}>
            Close list
          </button>
        </div>
      )}

      <div className="res-map-controls">
        {!compact && (
          <div className="res-map-pad" role="group" aria-label="Move the map">
            <button type="button" className="res-map-btn res-map-up" onClick={() => pan("up")} disabled={!controls.canPan.up}>
              ↑ Up
            </button>
            <button type="button" className="res-map-btn res-map-left" onClick={() => pan("left")} disabled={!controls.canPan.left}>
              ← Left
            </button>
            <button type="button" className="res-map-btn res-map-reset" onClick={reset} disabled={controls.atStart}>
              Reset
            </button>
            <button type="button" className="res-map-btn res-map-right" onClick={() => pan("right")} disabled={!controls.canPan.right}>
              Right →
            </button>
            <button type="button" className="res-map-btn res-map-down" onClick={() => pan("down")} disabled={!controls.canPan.down}>
              ↓ Down
            </button>
          </div>
        )}
        <div className="res-map-zoom" role="group" aria-label="Zoom">
          <button type="button" className="res-map-btn" onClick={() => zoom(1)} disabled={!controls.canZoomIn}>
            + Zoom in
          </button>
          <button type="button" className="res-map-btn" onClick={() => zoom(-1)} disabled={!controls.canZoomOut}>
            − Zoom out
          </button>
        </div>
      </div>

      {!compact && (
        <>
          <p id="res-map-keys" className="res-map-hint">
            Arrow keys move the map, + and − zoom, Home resets.{gestures && " You can also drag and scroll."}
          </p>
          <ul className="res-map-legend" aria-label="Legend">
            {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map((c) => (
              <li key={c}>
                <span className="res-map-legend-pin" style={{ background: CATEGORY_COLORS[c] }} aria-hidden="true">
                  {CATEGORY_LETTERS[c]}
                </span>
                {CATEGORY_LABELS[c]}
              </li>
            ))}
            {showTransit && (
              <li>
                <span className="res-map-legend-ring" aria-hidden="true" />
                1-mile ring around the place
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function SitePin({
  site,
  selected,
  showName,
  position,
  onPress,
}: {
  site: Site;
  selected: boolean;
  showName: boolean;
  position: { left: number; top: number };
  onPress: () => void;
}) {
  const first = site.markers[0];
  const many = site.markers.length > 1;
  const name = many
    ? `${site.markers.length} resources in one building: ${site.markers.map((mk) => mk.name).join(", ")}`
    : `${first.name}, ${CATEGORY_LABELS[first.category]}`;
  return (
    <span className="res-map-anchor" style={position}>
      <button
        type="button"
        className="res-map-pin"
        style={{ background: CATEGORY_COLORS[first.category] }}
        aria-label={name}
        aria-pressed={selected}
        onClick={onPress}
      >
        {CATEGORY_LETTERS[first.category]}
        {many && <span className="res-map-pin-count">{site.markers.length}</span>}
      </button>
      {showName && <span className="res-map-pin-name">{first.name}</span>}
    </span>
  );
}
