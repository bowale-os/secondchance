// Resource Map: a look-only map of places people leaving prison often need. Filter,
// zoom, move, and tap a pin, all with buttons. No search, no directions, no location.
import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isOpenNow, type Place } from '@scr/shared';
import { useSession } from '../session/SessionContext';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { BigButton } from '../components/BigButton';
import { colors, sizes } from '../theme';
import { friendlyDate } from '../text/format';
import { MapCanvas } from './components/MapCanvas';
import { ControlPad } from './components/ControlPad';
import { FilterPanel } from './components/FilterPanel';
import { LegendStrip } from './components/LegendStrip';
import { PlaceInfoCard } from './components/PlaceInfoCard';
import { PlaceListView } from './components/PlaceListView';
import { useMapView } from './hooks/useMapView';
import { useFilters } from './hooks/useFilters';
import { usePlaces } from './hooks/usePlaces';
import { filterSummary } from './logic/filters';
import { groupIntoSites, mapItems } from './logic/pins';
import type { Size } from './geo/viewMath';

/** Zoom used when opening the map on one place ("See it on the map"). */
export const FOCUS_ZOOM = 14;

export function ResourceMapScreen({ focusPlaceId }: { focusPlaceId?: string }) {
  const { places: repo, deviceStore } = useSession();
  const { filters, toggleCategory, showAll, hideAll, setOpenNow } = useFilters(deviceStore);
  const data = usePlaces(repo, filters);
  const [size, setSize] = useState<Size>({ width: 375, height: 420 });
  const map = useMapView(size);
  const [mode, setMode] = useState<'map' | 'list'>(Platform.OS === 'web' ? 'map' : 'list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<{ key: string; places: Place[] } | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  // The page scrolls so the legend is never cut off; the map gets about half the screen.
  const mapHeight = Math.max(320, Math.min(560, Math.round(useWindowDimensions().height * 0.5)));

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {}); }, []);

  const items = useMemo(() => mapItems(data.visible, map.view.zoom), [data.visible, map.view.zoom]);
  const closedIds = useMemo(
    () => new Set(data.places.filter(p => isOpenNow(p, data.now).state === 'closed').map(p => p.id)),
    [data.places, data.now],
  );

  // "See it on the map": zoom to the place and open its card, once places are loaded.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (focused || !focusPlaceId || !data.places.length) return;
    const p = data.places.find(x => x.id === focusPlaceId);
    setFocused(true);
    if (!p) return;
    setMode('map');
    map.focus(p.location.lng, p.location.lat, FOCUS_ZOOM);
    openPlace(p);
  }, [focusPlaceId, data.places, focused]);

  // Bring a newly opened card into view (the page scrolls on small screens).
  useEffect(() => {
    if (Platform.OS !== 'web' || !selected) return;
    document.getElementById('place-card')?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selected?.key]);

  function openPlace(p: Place) {
    const site = groupIntoSites(data.places).find(s => s.places.some(x => x.id === p.id));
    setSelected(site ? { key: site.key, places: site.places } : { key: p.id, places: [p] });
  }

  // Shared computers: arrow keys move, + and – zoom, Esc closes the card. Tab and Enter
  // already work on pins because they are buttons.
  useEffect(() => {
    if (Platform.OS !== 'web' || mode !== 'map' || filtersOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const actions: Record<string, () => void> = {
        ArrowUp: () => map.pan('up'), ArrowDown: () => map.pan('down'),
        ArrowLeft: () => map.pan('left'), ArrowRight: () => map.pan('right'),
        '+': map.zoomIn, '=': map.zoomIn, '-': map.zoomOut, '_': map.zoomOut,
        Escape: () => setSelected(null),
      };
      const act = actions[e.key];
      if (act) { e.preventDefault(); act(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, filtersOpen, map.pan, map.zoomIn, map.zoomOut]);

  const summary = filterSummary(data.categories, filters);
  const legendNote = data.offline && data.syncedAt ? `Places last updated ${friendlyDate(data.syncedAt.slice(0, 10))}.` : undefined;
  const speak = `Resource Map. Showing ${data.visible.length} places. ${summary.label}. `
    + 'Use the arrow buttons to move, plus and minus to zoom, and tap a pin to see details. Tap List to hear places as a list.';

  return (
    <Screen title="Resource Map" speak={speak} back>
      <View style={styles.controls}>
        <View style={{ flex: 1.4 }}>
          <BigButton icon="filter" label={summary.label} kind="secondary" onPress={() => setFiltersOpen(true)} />
        </View>
        <Pressable onPress={() => setOpenNow(!filters.openNow)} accessibilityRole="switch"
          accessibilityState={{ checked: filters.openNow }} accessibilityLabel="Open now only" style={[styles.toggle, filters.openNow && styles.toggleOn]}>
          <Ionicons name={filters.openNow ? 'time' : 'time-outline'} size={22} color={filters.openNow ? colors.onMoss : colors.moss} />
          <AppText variant="small" style={[styles.toggleText, filters.openNow && { color: colors.onMoss }]}>Open now</AppText>
        </Pressable>
        <Pressable onPress={() => { setSelected(null); setMode(m => (m === 'map' ? 'list' : 'map')); }} accessibilityRole="button"
          accessibilityLabel={mode === 'map' ? 'Show places as a list' : 'Show the map'} style={styles.toggle}>
          <Ionicons name={mode === 'map' ? 'list' : 'map'} size={22} color={colors.moss} />
          <AppText variant="small" style={styles.toggleText}>{mode === 'map' ? 'List' : 'Map'}</AppText>
        </Pressable>
      </View>

      <View style={[styles.mapArea, { height: mapHeight }]}>
        {mode === 'map' ? (
          <MapCanvas
            view={map.view}
            items={items}
            categories={data.categories}
            selectedKey={selected?.key ?? null}
            closedIds={closedIds}
            reduceMotion={reduceMotion}
            onSize={setSize}
            onSelectSite={s => setSelected({ key: s.key, places: s.places })}
            onSelectCluster={c => map.zoomInAt(c.lng, c.lat)}
          />
        ) : (
          <PlaceListView places={data.visible} categories={data.categories} now={data.now} onOpen={openPlace} topInset={data.isSample ? 28 : 0} />
        )}

        {data.isSample && (
          <View style={styles.banner} pointerEvents="none">
            <AppText variant="small" style={styles.bannerText}>Sample places only — not real locations</AppText>
          </View>
        )}
        {!data.loading && data.visible.length === 0 && (
          <View style={styles.empty}>
            <AppText variant="label" style={{ textAlign: 'center' }}>
              {data.places.length ? 'No places match. Turn on more filters.' : "Places couldn't load. Check your internet and try again."}
            </AppText>
            {data.places.length > 0 && <BigButton label="Show all" onPress={() => { showAll(); setOpenNow(false); }} />}
          </View>
        )}
      </View>

      {/* The card sits under the map (not on top of it) so it never hides pins or gets squeezed. */}
      {selected && (
        <PlaceInfoCard places={selected.places} categories={data.categories} now={data.now} onClose={() => setSelected(null)} />
      )}

      {mode === 'map' && (
        <ControlPad
          canPan={map.canPan} canZoomIn={map.canZoomIn} canZoomOut={map.canZoomOut} atStart={map.atStart}
          onPan={map.pan} onZoomIn={map.zoomIn} onZoomOut={map.zoomOut} onReset={map.reset}
        />
      )}
      <LegendStrip categories={data.categories} hidden={filters.hidden} note={legendNote} />

      <FilterPanel
        visible={filtersOpen}
        categories={data.categories}
        hidden={filters.hidden}
        counts={data.counts}
        onToggle={toggleCategory}
        onShowAll={showAll}
        onHideAll={() => hideAll(data.categories.map(c => c.id))}
        onDone={() => setFiltersOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  toggle: {
    flex: 1, minHeight: sizes.touch + 8, borderRadius: sizes.radius, borderWidth: 2, borderColor: colors.moss,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  toggleOn: { backgroundColor: colors.moss },
  toggleText: { fontWeight: '700', color: colors.ink, textAlign: 'center' },
  mapArea: { borderRadius: sizes.radius, overflow: 'hidden', borderWidth: 2, borderColor: colors.moss },
  banner: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.ink, paddingVertical: 4 },
  bannerText: { color: colors.cream, textAlign: 'center', fontWeight: '700' },
  empty: {
    position: 'absolute', top: '30%', left: 24, right: 24, padding: 16, gap: 10, borderRadius: sizes.radius,
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.moss,
  },
});
