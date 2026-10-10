// Web map: MapLibre GL draws the counties; every gesture is off (interactive: false), so
// only our buttons and keys move it. Pins are app buttons positioned with map.project().
//
// Zoom note: our zoom levels count 256-px tiles (zoom 9 = all five counties); MapLibre
// counts 512-px tiles, so MapLibre's zoom is ours minus one.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { config } from '../../config';
import counties from '../geo/counties.geo.json';
import { COUNTY_SHAPES, countyLabelPoint } from '../geo/counties';
import { mapColors } from '../theme';
import { ClusterPin, SitePin } from './Pins';
import type { MapCanvasProps } from './MapCanvas.types';

const NAME_LABELS_FROM_ZOOM = 14;
/** Pins this far past the edge are left out, so screen readers and Tab only reach what shows. */
const EDGE_SLACK = 24;

export function MapCanvas(props: MapCanvasProps) {
  const { view, items, categories, selectedKey, closedIds, reduceMotion, onSize, onSelectSite, onSelectCluster } = props;
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [, setFrame] = useState(0);   // re-render pins as the camera moves
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      // TODO(backend): use config.MAP_STYLE_URL (Amazon Location Service) once AWS is set up,
      // then add the county layers on top. Until then: county outlines only, no tiles.
      style: {
        version: 8,
        sources: { counties: { type: 'geojson', data: counties as unknown as maplibregl.GeoJSONSourceSpecification['data'] } },
        layers: [
          { id: 'outside', type: 'background', paint: { 'background-color': mapColors.outside } },
          { id: 'county-fill', type: 'fill', source: 'counties', paint: { 'fill-color': mapColors.land } },
          { id: 'county-line', type: 'line', source: 'counties', paint: { 'line-color': mapColors.countyLine, 'line-width': 2 } },
        ],
      },
      center: view.center,
      zoom: view.zoom - 1,
      interactive: false,          // no drag, pinch, scroll-wheel, double-tap, rotate, or keyboard
      attributionControl: false,
      renderWorldCopies: false,
    });
    const redraw = () => setFrame(f => f + 1);
    m.on('move', redraw);
    m.on('load', redraw);
    map.current = m;
    void config;   // config.MAP_STYLE_URL is read here once tiles exist
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.easeTo({ center: view.center, zoom: view.zoom - 1, duration: reduceMotion ? 0 : 300 });
  }, [view.center[0], view.center[1], view.zoom, reduceMotion]);

  const m = map.current;
  const at = (lng: number, lat: number) => {
    const p = m ? m.project([lng, lat]) : { x: -999, y: -999 };
    return { left: p.x, top: p.y };
  };
  const onScreen = (lng: number, lat: number) => {
    const { left, top } = at(lng, lat);
    return left >= -EDGE_SLACK && top >= -EDGE_SLACK && left <= box.width + EDGE_SLACK && top <= box.height + EDGE_SLACK;
  };
  const catById = new Map(categories.map(c => [c.id, c]));

  return (
    <View
      style={styles.wrap}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        onSize({ width, height });
        setBox({ width, height });
        map.current?.resize();
      }}
    >
      <div ref={container} style={{ position: 'absolute', inset: 0 }} aria-hidden="true" />
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {m && COUNTY_SHAPES.map(c => {
          const [lng, lat] = countyLabelPoint(c);
          return (
            <View key={c.id} style={[styles.anchor, at(lng, lat)]} pointerEvents="none">
              <Text style={styles.county}>{c.name}</Text>
            </View>
          );
        })}
        {m && items.filter(item => onScreen(item.lng, item.lat)).map(item => (
          <View key={item.key} style={[styles.anchor, at(item.lng, item.lat)]} pointerEvents="box-none">
            {item.kind === 'cluster'
              ? <ClusterPin cluster={item} onPress={() => onSelectCluster(item)} />
              : <SitePin
                  site={item}
                  category={catById.get(item.places[0].categoryId)}
                  selected={item.key === selectedKey}
                  closed={item.places.every(p => closedIds.has(p.id))}
                  showName={view.zoom >= NAME_LABELS_FROM_ZOOM}
                  onPress={() => onSelectSite(item)}
                />}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden', backgroundColor: mapColors.outside },
  anchor: { position: 'absolute', width: 0, height: 0, overflow: 'visible', alignItems: 'center', justifyContent: 'center' },
  county: {
    position: 'absolute', width: 120, textAlign: 'center', fontSize: 16, fontWeight: '800',
    color: mapColors.countyLine, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 1,
  },
});
