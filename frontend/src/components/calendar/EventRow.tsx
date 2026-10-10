import { formatWhen } from "../../lib/format";
import { TYPE_LABEL, eventTitle, timeText, type CalendarEvent } from "../../lib/calendar";

interface Props {
  event: CalendarEvent;
  /** Show the date, not just the time (used outside the picked day). */
  showDate?: boolean;
  onOpen: (event: CalendarEvent) => void;
}

/** One event in a list. The whole row opens its details. State is always spelled out in words. */
export default function EventRow({ event: e, showDate, onOpen }: Props) {
  const when = showDate && e.due_date ? formatWhen(e.due_date, e.due_time) : timeText(e);
  return (
    <button type="button" className={`cal-row ct-${e.obligation_type}${e.status === "done" ? " done" : ""}`} onClick={() => onOpen(e)}>
      <span className="cal-row-main">
        <span className="cal-row-type">{TYPE_LABEL[e.obligation_type]}</span>
        {e.client_name && <span className="cal-row-client">{e.client_name}</span>}
        <span className="cal-row-title">{eventTitle(e)}</span>
        {e.location && <span className="cal-row-sub">{e.location}</span>}
      </span>
      <span className="cal-row-side">
        <span className="cal-row-time">{when}</span>
        {e.status === "overdue" && <span className="status status-review">Past due</span>}
        {e.status === "done" && <span className="status status-ok">Done</span>}
        {e.added_by_client && e.status === "open" && <span className="cal-row-note">Added by client</span>}
      </span>
    </button>
  );
}
