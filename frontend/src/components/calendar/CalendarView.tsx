import { useMemo, useState } from "react";
import {
  DAY_PARTS,
  TYPE_LABEL,
  TYPE_ORDER,
  byTime,
  dayPart,
  groupByDay,
  groupDays,
  isoDate,
  mergeDuplicates,
  parseIso,
  type CalendarEvent,
} from "../../lib/calendar";
import { errorText } from "../../lib/errors";
import { daysUntil } from "../../lib/format";
import type { EventWrite, ObligationType } from "../../types";
import DayGroup from "./DayGroup";
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

/** Days shown under "Coming up" before the rest sit behind a button. */
const UPCOMING_DAYS = 6;

/**
 * Month grid on the left. On the right: a short summary, the picked day, then Past due and
 * Coming up grouped by day. Shared by case workers (all clients, can mark done) and clients
 * (own events, can add).
 */
export default function CalendarView({ role, events: rawEvents, onSetDone, onOpenClient, onAdd, onEdit, onRemove }: Props) {
  const today = isoDate(new Date());
  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState(() => parseIso(today));
  const [type, setType] = useState<ObligationType | "all">("all");
  const [clientId, setClientId] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<"new" | CalendarEvent | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const events = useMemo(() => mergeDuplicates(rawEvents), [rawEvents]);

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
  const elsewhere = visible.filter((e) => e.due_date !== selected);
  const late = groupDays(elsewhere.filter((e) => e.status === "overdue"));
  const coming = groupDays(elsewhere.filter((e) => e.status === "open" && e.due_date && e.due_date >= today));
  const ongoing = elsewhere.filter((e) => e.status === "open" && !e.due_date);
  const finished = groupDays(elsewhere.filter((e) => e.status === "done")).reverse();
  const shownUpcoming = showAllUpcoming ? coming : coming.slice(0, UPCOMING_DAYS);

  // Summary over everything that is not finished, whatever day is picked.
  const open = visible.filter((e) => e.status !== "done");
  const pastDue = open.filter((e) => e.status === "overdue").length;
  const thisWeek = open.filter((e) => e.due_date && e.status === "open" && daysUntil(e.due_date) >= 0 && daysUntil(e.due_date) <= 7).length;

  const detail = events.find((e) => e.id === openId) ?? null;
  const pick = (iso: string) => {
    setSelected(iso);
    setCursor(parseIso(iso));
  };
  const heading = parseIso(selected).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const openEvent = (e: CalendarEvent) => setOpenId(e.id);

  async function quickDone(event: CalendarEvent) {
    if (!onSetDone) return;
    setError(null);
    setBusyId(event.id);
    try {
      await onSetDone(event, true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }
  const done = role === "staff" && onSetDone ? quickDone : undefined;

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
        <ul className="cal-summary" aria-label="Summary">
          <li className={pastDue ? "late" : ""}><strong>{pastDue}</strong> past due</li>
          <li><strong>{thisWeek}</strong> in the next 7 days</li>
          <li><strong>{open.length}</strong> not finished</li>
        </ul>

        {error && <p className="dash-error" role="alert">{error}</p>}

        {events.length > 0 && visible.length === 0 && (
          <p className="cal-nomatch" role="status">
            Nothing matches these filters.
            <button type="button" className="text-link" onClick={() => { setType("all"); setClientId("all"); }}>
              Show everything
            </button>
          </p>
        )}

        <section className="cal-today-card" aria-label={heading}>
          <h2>{heading}{selected === today && <span className="cal-now">Today</span>}</h2>
          {dayEvents.length === 0 ? (
            <p className="cal-empty-day">
              Nothing on this day.{role === "client" && " Use “Add an event” to put something here."}
            </p>
          ) : (
            DAY_PARTS.map((part) => {
              const list = dayEvents.filter((e) => dayPart(e.due_time) === part);
              return list.length === 0 ? null : (
                <div key={part} className="cal-part">
                  <h3>{part}</h3>
                  <div className="cal-list">
                    {list.map((e) => <EventRow key={e.id} event={e} onOpen={openEvent} onDone={done} busy={busyId === e.id} />)}
                  </div>
                </div>
              );
            })
          )}
        </section>

        {late.length > 0 && (
          <section className="cal-block cal-block-late" aria-label="Past due">
            <h2>Past due <span className="panel-count">({late.reduce((n, [, l]) => n + l.length, 0)})</span></h2>
            {late.map(([iso, list]) => (
              <DayGroup key={iso} iso={iso} events={list} late onOpen={openEvent} onDone={done} busyId={busyId} />
            ))}
          </section>
        )}

        {coming.length > 0 && (
          <section className="cal-block" aria-label="Coming up">
            <h2>Coming up <span className="panel-count">({coming.reduce((n, [, l]) => n + l.length, 0)})</span></h2>
            {shownUpcoming.map(([iso, list]) => (
              <DayGroup key={iso} iso={iso} events={list} onOpen={openEvent} onDone={done} busyId={busyId} />
            ))}
            {coming.length > UPCOMING_DAYS && (
              <button type="button" className="text-link" aria-expanded={showAllUpcoming} onClick={() => setShowAllUpcoming((s) => !s)}>
                {showAllUpcoming ? "Show fewer" : `Show ${coming.length - UPCOMING_DAYS} more ${coming.length - UPCOMING_DAYS === 1 ? "day" : "days"}`}
              </button>
            )}
          </section>
        )}

        {ongoing.length > 0 && (
          <section className="cal-block" aria-label="Ongoing">
            <h2>Ongoing <span className="panel-count">({ongoing.length})</span></h2>
            <p className="hint">These repeat or have no set date.</p>
            <div className="cal-list">
              {ongoing.map((e) => <EventRow key={e.id} event={e} onOpen={openEvent} onDone={done} busy={busyId === e.id} />)}
            </div>
          </section>
        )}

        {finished.length > 0 && (
          <section className="cal-block" aria-label="Finished">
            <button type="button" className="text-link" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
              {showDone ? "Hide finished" : `Show ${finished.reduce((n, [, l]) => n + l.length, 0)} finished`}
            </button>
            {showDone && finished.map(([iso, list]) => <DayGroup key={iso} iso={iso} events={list} onOpen={openEvent} busyId={busyId} />)}
          </section>
        )}

        {events.length === 0 && (
          <p className="cal-empty-day">
            {role === "client" ? "No events yet. Use “Add an event” to add your first." : "None of your clients have events yet."}
          </p>
        )}
      </div>

      {detail && !form && (
        <EventDetail
          event={detail}
          role={role}
          onClose={() => setOpenId(null)}
          onSetDone={onSetDone}
          onOpenClient={onOpenClient}
          onEdit={onEdit ? () => setForm(detail) : undefined}
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
