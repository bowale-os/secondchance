import { useEffect, useState } from "react";
import type { DocStatus } from "../../lib/clientDocuments";
import { profileReason } from "../../lib/clientNeeds";
import { errorText } from "../../lib/errors";
import type {
  ClientRead,
  ClientResourceMatch,
  RequiredDocument,
  Resource,
  ResourceCategory,
  ResourceQuery,
  ResourceSummary,
} from "../../types";
import ResourceDrawer from "./ResourceDrawer";
import ResourceFilters from "./ResourceFilters";
import ResourceResults from "./ResourceResults";
import "./resources.css";

export interface MatchCopy {
  intro: string;
  placeholder: string;
  /** "from profile" or "from your profile" */
  profileNote: string;
  reset: string;
  empty: string;
  count: (n: number) => string;
}

interface Props {
  client: ClientRead;
  /** GET /clients/{id}/resources or GET /me/resources, with overrides. */
  loadMatches: (overrides: ResourceQuery) => Promise<ClientResourceMatch>;
  loadResource: (id: string) => Promise<Resource>;
  documentStatus?: (doc: RequiredDocument) => DocStatus;
  progressScope: string;
  /** Staff can drag and scroll the map; clients use the buttons. */
  mapGestures: boolean;
  copy: MatchCopy;
}

/** Keys the profile can turn on that are yes/no, so turning one off must be sent as `false`. */
const BOOLEAN_KEYS = new Set<keyof ResourceQuery>(["near_transit", "open_now", "no_id_required", "records_accepted", "families"]);

/**
 * Resources matched to one client's needs (Option C). Filters start from their profile;
 * every change is sent back as overrides so the server stays the one place the mapping lives.
 */
export default function MatchedResources({ client, loadMatches, loadResource, documentStatus, progressScope, mapGestures, copy }: Props) {
  const [overrides, setOverrides] = useState<ResourceQuery>({});
  const [match, setMatch] = useState<ClientResourceMatch | null>(null);
  // What the chips show: the change right away, then the server's answer.
  const [shown, setShown] = useState<ResourceQuery>({});
  const [items, setItems] = useState<ResourceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetCount, setResetCount] = useState(0);

  useEffect(() => {
    let current = true;
    setError(null);
    setMatch(null);
    loadMatches(overrides)
      .then((m) => {
        if (!current) return;
        setMatch(m);
        setShown(m.query);
        setItems(m.results.items);
      })
      .catch((e) => current && setError(errorText(e)));
    return () => {
      current = false;
    };
  }, [loadMatches, overrides]);

  const fromProfile = (key: keyof ResourceQuery) =>
    match?.applied.some((a) => a.key === key && a.reason === "profile") ?? false;

  function change(next: ResourceQuery) {
    const o: ResourceQuery = { ...next, cursor: undefined };
    // A profile filter the case worker turned off has to be sent as "off", or the profile's value comes back.
    for (const key of BOOLEAN_KEYS) {
      if (fromProfile(key) && !o[key]) (o as Record<string, unknown>)[key] = false;
    }
    if (fromProfile("language") && !o.language) o.language = "";
    setShown(next);
    setOverrides(o);
  }

  function reset() {
    setOverrides({});
    setResetCount((n) => n + 1);
  }

  async function showMore() {
    const cursor = match?.results.next_cursor;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const m = await loadMatches({ ...overrides, cursor });
      setItems((prev) => [...prev, ...m.results.items]);
      setMatch((prev) => prev && { ...prev, results: { ...prev.results, next_cursor: m.results.next_cursor } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const noteFor = (key: keyof ResourceQuery, category?: ResourceCategory) => {
    if (!fromProfile(key)) return undefined;
    const reason = profileReason(client, key, category);
    if (key === "categories" && !reason) return undefined; // a category the case worker added
    return reason ? `${copy.profileNote}: ${reason}` : copy.profileNote;
  };

  const total = match?.results.total ?? 0;

  return (
    <div className="res-matched">
      <div className="res-matched-head">
        <p className="res-muted">{copy.intro}</p>
        {Object.keys(overrides).length > 0 && (
          <button type="button" className="dash-btn dash-btn-quiet" onClick={reset}>
            {copy.reset}
          </button>
        )}
        <ResourceFilters key={resetCount} query={shown} onChange={change} noteFor={noteFor} placeholder={copy.placeholder} />
      </div>

      <p className="res-count" role="status">{match ? copy.count(total) : ""}</p>

      {error ? (
        <p className="dash-error" role="alert">{error}</p>
      ) : !match ? (
        <p className="dash-empty">Loading…</p>
      ) : items.length === 0 ? (
        <p className="dash-empty">{copy.empty}</p>
      ) : (
        <>
          <ResourceResults
            items={items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            center={shown.origin ?? null}
            gestures={mapGestures}
            more={
              match.results.next_cursor && (
                <div className="res-more">
                  <button className="dash-btn dash-btn-quiet" onClick={showMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : `Show more (${items.length} of ${total})`}
                  </button>
                </div>
              )
            }
          />
        </>
      )}

      {selectedId && (
        <ResourceDrawer
          resourceId={selectedId}
          load={loadResource}
          onClose={() => setSelectedId(null)}
          documentStatus={documentStatus}
          progressScope={progressScope}
          mapGestures={mapGestures}
        />
      )}
    </div>
  );
}
