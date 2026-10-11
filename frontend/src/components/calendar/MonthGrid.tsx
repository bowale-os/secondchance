import { monthCells, parseIso, type CalendarEvent } from "../../lib/calendar";

interface Props {
  cursor: Date;
  selected: string;
  today: string;
  byDay: Map<string, CalendarEvent[]>;
  onSelect: (iso: string) => void;
  onMonth: (delta: number) => void;
  onToday: () => void;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** Month at a glance. Each day is a button; colored dots show what is on it (the day's list has the words). */
export default function MonthGrid({ cursor, selected, today, byDay, onSelect, onMonth, onToday }: Props) {
  const label = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return (
    <div className="cal-month">
      <div className="cal-month-head">
        <button type="button" className="dash-btn dash-btn-quiet" aria-label="Previous month" onClick={() => onMonth(-1)}>‹</button>
        <strong>{label}</strong>
        <button type="button" className="dash-btn dash-btn-quiet" aria-label="Next month" onClick={() => onMonth(1)}>›</button>
      </div>
      <div className="cal-grid" role="group" aria-label={label}>
        {WEEKDAYS.map((d, i) => <span key={i} className="cal-dow" aria-hidden="true">{d}</span>)}
        {monthCells(cursor).map((cell) => {
          const events = byDay.get(cell.iso) ?? [];
          const open = events.filter((e) => e.status !== "done");
          const name = parseIso(cell.iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
          return (
            <button
              key={cell.iso}
              type="button"
              className={`cal-cell${cell.inMonth ? "" : " out"}${cell.iso === today ? " today" : ""}`}
              aria-pressed={cell.iso === selected}
              aria-label={`${name}: ${events.length === 0 ? "nothing" : `${events.length} ${events.length === 1 ? "event" : "events"}`}`}
              onClick={() => onSelect(cell.iso)}
            >
              {cell.day}
              <span className="cal-dots" aria-hidden="true">
                {open.slice(0, 3).map((e) => <i key={e.id} className={`ct-${e.obligation_type}${e.status === "overdue" ? " late" : ""}`} />)}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" className="text-link cal-today" onClick={onToday}>Go to today</button>
    </div>
  );
}
