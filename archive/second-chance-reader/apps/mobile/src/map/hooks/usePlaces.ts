// Places for the map: shows the device cache immediately, then refreshes in the
// background, and re-checks "Open now" every minute.
import { useEffect, useMemo, useState } from 'react';
import type { PlaceRepository, PlacesSnapshot } from '../data/PlaceRepository';
import { applyFilters, countsByCategory, type FilterState } from '../logic/filters';

const EMPTY: PlacesSnapshot = { categories: [], places: [], syncedAt: null, isSample: false };

export function usePlaces(repo: PlaceRepository, filters: FilterState) {
  const [snapshot, setSnapshot] = useState<PlacesSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await repo.load();
      if (alive && cached.places.length) { setSnapshot(cached); setLoading(false); }
      const { ok, snapshot: fresh } = await repo.refresh();
      if (!alive) return;
      setSnapshot(fresh);
      setOffline(!ok);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [repo]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(() => applyFilters(snapshot.places, filters, now), [snapshot.places, filters, now]);
  const counts = useMemo(() => countsByCategory(snapshot.places), [snapshot.places]);

  return { ...snapshot, visible, counts, loading, offline, now };
}
