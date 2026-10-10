import type { TransitStop } from "../../types";
import { formatMiles } from "./labels";

/**
 * "Near transit" in list rows. In the drawer, pass `stop` (the nearest one) to say how far:
 * "about 0.4 mi to Five Points". Distance is straight-line, computed at ingest.
 */
export default function TransitBadge({ near, stop }: { near: boolean; stop?: TransitStop }) {
  if (!near) return null;
  return (
    <span className="res-badge res-badge-transit">
      Near transit
      {stop && <span className="res-badge-detail"> · {formatMiles(stop.distance_m)} to {stop.stop_name}</span>}
    </span>
  );
}
