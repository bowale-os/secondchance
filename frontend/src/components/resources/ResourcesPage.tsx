import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "../../api";
import { errorText } from "../../lib/errors";
import type { LatLng, ResourceQuery, ResourceSummary, StaffRead } from "../../types";
import AppBar, { type AppNav } from "../layout/AppBar";
import ResourceDrawer from "./ResourceDrawer";
import ResourceFilters from "./ResourceFilters";
import ResourceRows from "./ResourceRows";
import "../dashboard/dashboard.css";
import "./resources.css";

interface Props {
  staff: StaffRead;
  nav: AppNav;
  onLogout: () => void;
}

interface Results {
  items: ResourceSummary[];
  total: number;
  nextCursor: string | null;
}

/** Top-level Resources page (Option A): search, filter chips, slim result list. */
export default function ResourcesPage({ staff, nav, onLogout }: Props) {
  const api = useApi();
  const [filters, setFilters] = useState<ResourceQuery>({});
  // Distance is measured from here. Null until staff can enter an address, so rows show no distance yet.
  const [origin] = useState<LatLng | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadResource = useCallback((id: string) => api.resources.get(id), [api]);

  const query = useMemo<ResourceQuery>(() => ({ ...filters, origin: origin ?? undefined }), [filters, origin]);

  // New first page whenever the filters change; answers to older queries are ignored.
  useEffect(() => {
    let current = true;
    setError(null);
    setResults(null);
    api.resources
      .search(query)
      .then((res) => current && setResults({ items: res.items, total: res.total, nextCursor: res.next_cursor }))
      .catch((e) => current && setError(errorText(e)));
    return () => {
      current = false;
    };
  }, [api, query]);

  async function showMore() {
    if (!results?.nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await api.resources.search({ ...query, cursor: results.nextCursor });
      setResults({ items: [...results.items, ...res.items], total: res.total, nextCursor: res.next_cursor });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const count = results ? `${results.total} ${results.total === 1 ? "resource" : "resources"} found` : "";

  return (
    <div className="dash">
      <a className="skip-link" href="#dash-main">Skip to main content</a>
      <AppBar staff={staff} nav={nav} onLogout={onLogout} />

      <main id="dash-main" className="dash-main">
        <div className="dash-title">
          <h1>Resources</h1>
        </div>

        <section className="dash-panel" aria-labelledby="resources-heading">
          <div className="dash-panel-head res-panel-head">
            <h2 id="resources-heading">Find help nearby</h2>
            <ResourceFilters query={filters} onChange={setFilters} />
          </div>

          {/* Live region: announces the new count whenever the filters change. */}
          <p className="res-count" role="status">{count}</p>

          {error ? (
            <p className="dash-error" role="alert">{error}</p>
          ) : !results ? (
            <p className="dash-empty">Loading resources…</p>
          ) : results.items.length === 0 ? (
            <p className="dash-empty">No resources match these filters. Try turning some off.</p>
          ) : (
            <>
              <ResourceRows items={results.items} selectedId={selectedId} onSelect={setSelectedId} />
              {results.nextCursor && (
                <div className="res-more">
                  <button className="dash-btn dash-btn-quiet" onClick={showMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : `Show more (${results.items.length} of ${results.total})`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {selectedId && <ResourceDrawer resourceId={selectedId} load={loadResource} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
