import { parseIso, type CalendarEvent } from "../../lib/calendar";
import EventRow from "./EventRow";

interface Props {
  iso: string;
  events: CalendarEvent[];
  late?: boolean;
  onOpen: (event: CalendarEvent) => void;
  onDone?: (event: CalendarEvent) => void;
  busyId: string | null;
}

/** One day in a list: a date badge on the left, that day's events on the right. */
export default function DayGroup({ iso, events, late, onOpen, onDone, busyId }: Props) {
  const d = parseIso(iso);
  const full = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <section className={`cal-dg${late ? " late" : ""}`} aria-label={full}>
      <div className="cal-badge" aria-hidden="true">
        <span>{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
        <strong>{d.getDate()}</strong>
        <span>{d.toLocaleDateString(undefined, { month: "short" })}</span>
      </div>
      <div className="cal-list">
        {events.map((e) => (
          <EventRow key={e.id} event={e} onOpen={onOpen} onDone={onDone} busy={busyId === e.id} />
        ))}
      </div>
    </section>
  );
}
