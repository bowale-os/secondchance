import { useMemo, useState } from "react";
import {
  DAY_PARTS,
  TYPE_LABEL,
  TYPE_ORDER,
  byTime,
  dayPart,
  groupByDay,
  isoDate,
  parseIso,
  type CalendarEvent,
} from "../../lib/calendar";
import type { EventWrite, ObligationType } from "../../types";
import EventDetail from "./EventDetail";
import EventForm from "./EventForm";
import EventRow from "./EventRow";
import MonthGrid from "./MonthGrid";
import "./calendar.css";

interface Props {
  role: "staff" | "client";
  events: CalendarEvent[];
  /** Case worker actions. */
  onSetDone?: (event: CalendarEvent, done: boolean) => Promise<void>;
  onOpenClient?: (clientId: string) => void;
  /** Client actions (only for events the client added). */
  onAdd?: (body: EventWrite) => Promise<void>;
  onEdit?: (id: string, body: EventWrite) => Promise<void>;
  onRemove?: (event: CalendarEvent) => Promise<void>;
}

const byDate = (a: CalendarEvent, b: CalendarEvent) => (a.due_date ?? "").localeCompare(b.due_date ?? "") || byTime(a, b);

/**
 * Month grid on the left, the picked day on the right, then what is coming up.
 * Shared by case workers (all clients, can mark done) and clients (own events, can add).
 */
export default function CalendarView({ role, events, onSetDone, onOpenClient, onAdd, onEdit, onRemove }: Props) {
  const today = isoDate(new Date());
  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState(() => parseIso(today));
  const [type, setType] = useState<ObligationType | "all">("all");
  const [clientId, setClientId] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<"new" | CalendarEvent | null>(null);

  const clients = useMemo(() => {
    const names = new Map<string, string>();
    events.forEach((e) => e.client_name && names.set(e.client_id, e.client_name));
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [events]);

  const visible = useMemo(
    () => events.filter((e) => (type === "all" || e.obligation_type === type) && (clientId === "all" || e.client_id === clientId)),
    [events, type, clientId]
  );
  const byDay = useMemo(() => groupByDay(visible), [visible]);

  const dayEvents = [...(byDay.get(selected) ?? [])].sort(byTime);
  const elsewhere = visible.filter((e) => e.due_date !== selected).sort(byDate);
  const late = elsewhere.filter((e) => e.status === "overdue");
  const coming = elsewhere.filter((e) => e.status === "open" && e.due_date && e.due_date >= today);
  const undated = elsewhere.filter((e) => e.status === "open" && !e.due_date);
  const finished = elsewhere.filter((e) => e.status === "done").reverse();

  const open = events.find((e) => e.id === openId) ?? null;
  const pick = (iso: string) => {
    setSelected(iso);
    setCursor(parseIso(iso));
  };
  const heading = parseIso(selected).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const group = (title: string, list: CalendarEvent[], tone?: "late") => (
    <section className={`cal-group${tone ? ` cal-group-${tone}` : ""}`} aria-label={title}>
      <h3>{title} <span className="panel-count">({list.length})</span></h3>
      <div className="cal-list">{list.map((e) => <EventRow key={e.id} event={e} showDate onOpen={(x) => setOpenId(x.id)} />)}</div>
    </section>
  );

  return (
    <div className="cal">
      <aside className="cal-side" aria-label="Month">
        <MonthGrid
          cursor={cursor}
          selected={selected}
          today={today}
          byDay={byDay}
          onSelect={pick}
          onMonth={(delta) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1, 12))}
          onToday={() => pick(today)}
        />

        <div className="cal-filters" role="group" aria-label="Show">
          <button type="button" className="cal-chip" aria-pressed={type === "all"} onClick={() => setType("all")}>All</button>
          {TYPE_ORDER.map((t) => (
            <button key={t} type="button" className={`cal-chip ct-${t}`} aria-pressed={type === t} onClick={() => setType(t)}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {role === "staff" && clients.length > 1 && (
          <label className="field">
            Client
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="all">All clients</option>
              {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        )}

        {role === "client" && onAdd && (
          <button type="button" className="dash-btn" onClick={() => setForm("new")}>+ Add an event</button>
        )}
      </aside>

      <div className="cal-main">
        <section className="cal-group cal-day" aria-label={heading}>
          <h2>{heading} <span className="panel-count">({dayEvents.length})</span></h2>
          {dayEvents.length === 0 ? (
            <p className="cal-empty">
              {role === "client" ? "Nothing this day. Use “Add an event” to put something here." : "Nothing this day."}
            </p>
          ) : (
            DAY_PARTS.map((part) => {
              const list = dayEvents.filter((e) => dayPart(e.due_time) === part);
              return list.length === 0 ? null : (
                <div key={part} className="cal-part">
                  <h3>{part}</h3>
                  <div className="cal-list">{list.map((e) => <EventRow key={e.id} event={e} onOpen={(x) => setOpenId(x.id)} />)}</div>
                </div>
              );
            })
          )}
        </section>

        {late.length > 0 && group("Past due", late, "late")}
        {coming.length > 0 && group("Coming up", coming)}
        {undated.length > 0 && group("No date yet", undated)}
        {finished.length > 0 && (
          <section className="cal-group" aria-label="Finished">
            <button type="button" className="text-link" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
              {showDone ? "Hide finished" : `Show ${finished.length} finished`}
            </button>
            {showDone && <div className="cal-list">{finished.map((e) => <EventRow key={e.id} event={e} showDate onOpen={(x) => setOpenId(x.id)} />)}</div>}
          </section>
        )}
        {events.length === 0 && (
          <p className="cal-empty">
            {role === "client" ? "No events yet. Use “Add an event” to add your first." : "None of your clients have events yet."}
          </p>
        )}
      </div>

      {open && !form && (
        <EventDetail
          event={open}
          role={role}
          onClose={() => setOpenId(null)}
          onSetDone={onSetDone}
          onOpenClient={onOpenClient}
          onEdit={onEdit ? () => setForm(open) : undefined}
          onRemove={onRemove}
        />
      )}
      {form && (onAdd || onEdit) && (
        <EventForm
          event={form === "new" ? undefined : form}
          startDate={selected}
          onSave={(body) => (form === "new" ? onAdd!(body) : onEdit!(form.id, body))}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
