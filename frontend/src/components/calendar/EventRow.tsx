import { formatWhen } from "../../lib/format";
import { TYPE_LABEL, eventTitle, timeText, type CalendarEvent } from "../../lib/calendar";

interface Props {
  event: CalendarEvent;
  /** Show the date with the time. Off when the row already sits under a date. */
  showDate?: boolean;
  onOpen: (event: CalendarEvent) => void;
  /** Case workers get a one-tap "Done" on events that are not finished. */
  onDone?: (event: CalendarEvent) => void;
  busy?: boolean;
}

/** One event: type and time on the first line, what it is below. The whole card opens its details. */
export default function EventRow({ event: e, showDate, onOpen, onDone, busy }: Props) {
  const time = showDate && e.due_date ? formatWhen(e.due_date, e.due_time) : timeText(e);
  const late = e.status === "overdue";
  return (
    <div className={`cal-row ct-${e.obligation_type}${e.status === "done" ? " done" : ""}${late ? " late" : ""}`}>
      <button type="button" className="cal-row-open" onClick={() => onOpen(e)} aria-label={`${TYPE_LABEL[e.obligation_type]}, ${eventTitle(e)}, ${time}. Open details`}>
        <span className="cal-row-top">
          <span className="cal-row-type">{TYPE_LABEL[e.obligation_type]}</span>
          <span className="cal-row-time">{time}</span>
          {late && <span className="status status-review">Past due</span>}
          {e.status === "done" && <span className="status status-ok">Done</span>}
          {e.added_by_client && e.status === "open" && <span className="cal-row-note">Added by client</span>}
        </span>
        <span className="cal-row-title">{eventTitle(e)}</span>
        {(e.client_name || e.location) && (
          <span className="cal-row-sub">
            {e.client_name && <strong>{e.client_name}</strong>}
            {e.client_name && e.location && " · "}
            {e.location}
          </span>
        )}
      </button>
      {onDone && e.status !== "done" && (
        <button type="button" className="dash-btn dash-btn-quiet cal-row-done" disabled={busy} onClick={() => onDone(e)}>
          {busy ? "Saving…" : "Done"}
        </button>
      )}
    </div>
  );
}
