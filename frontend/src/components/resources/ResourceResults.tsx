import { useMemo, useState, type ReactNode } from "react";
import type { LatLng, ResourceSummary } from "../../types";
import { AREA_CENTER } from "./map/geo";
import ResourceMap from "./map/LazyResourceMap";
import type { MapMarker } from "./map/pins";
import ResourceRows from "./ResourceRows";

type Mode = "list" | "map";

interface Props {
  items: ResourceSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Client address or office; the middle of the five counties when null. */
  center: LatLng | null;
  /** Staff can drag and scroll the map as well. */
  gestures: boolean;
  /** "Show more" button, shown under either view. */
  more?: ReactNode;
}

/** Results as the list (default) or Map view. The list always carries everything the map shows. */
export default function ResourceResults({ items, selectedId, onSelect, center, gestures, more }: Props) {
  const [mode, setMode] = useState<Mode>("list");

  const markers = useMemo<MapMarker[]>(
    () =>
      items.flatMap((r) => (r.location ? [{ id: r.id, lat: r.location.lat, lng: r.location.lng, category: r.category, name: r.name }] : [])),
    [items]
  );
  const unmapped = items.length - markers.length;

  return (
    <>
      <div className="res-view-toggle" role="group" aria-label="Show results as">
        {(["list", "map"] as const).map((m) => (
          <button key={m} type="button" className="res-chip" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {m === "list" ? "List" : "Map view"}
          </button>
        ))}
      </div>

      {mode === "list" ? (
        <ResourceRows items={items} selectedId={selectedId} onSelect={onSelect} />
      ) : (
        <>
          <ResourceMap
            markers={markers}
            selectedId={selectedId}
            onSelect={onSelect}
            center={center ?? AREA_CENTER}
            gestures={gestures}
            label={`Map of ${markers.length} ${markers.length === 1 ? "resource" : "resources"}`}
          />
          {unmapped > 0 && (
            <p className="res-map-unmapped">
              {unmapped} {unmapped === 1 ? "resource has" : "resources have"} no address, so {unmapped === 1 ? "it is" : "they are"}{" "}
              only in the list.
            </p>
          )}
        </>
      )}

      {more}
    </>
  );
}
