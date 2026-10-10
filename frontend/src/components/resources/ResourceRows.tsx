import type { ResourceSummary } from "../../types";
import { CATEGORY_LABELS, VERIFICATION_LABELS, formatMiles, formatStart } from "./labels";
import TransitBadge from "./TransitBadge";

interface Props {
  items: ResourceSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Slim result rows: everything else waits for the drawer. */
export default function ResourceRows({ items, selectedId, onSelect }: Props) {
  return (
    <ul className="row-list">
      {items.map((r) => (
        <li key={r.id}>
          <button
            className="client-row res-row"
            aria-current={r.id === selectedId ? "true" : undefined}
            onClick={() => onSelect(r.id)}
          >
            <span className="client-main">
              <span className="client-name">{r.name}</span>
              <span className="res-meta">
                <span>{CATEGORY_LABELS[r.category]}</span>
                {r.starts_at && <span>{formatStart(r.starts_at)}</span>}
                {r.distance_m !== null && <span>{formatMiles(r.distance_m)}</span>}
              </span>
            </span>
            <span className="res-badges">
              <TransitBadge near={r.near_transit} />
              {r.open_now !== null && (
                <span className={`res-badge ${r.open_now ? "res-badge-open" : "res-badge-closed"}`}>
                  {r.open_now ? "Open now" : "Closed now"}
                </span>
              )}
              <span className={`res-badge res-badge-${r.verification}`}>{VERIFICATION_LABELS[r.verification]}</span>
            </span>
            <span className="chevron" aria-hidden="true">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
