import { useEffect, useState } from "react";
import type { ClientApi } from "../../api";
import type { CalendarEvent } from "../../lib/calendar";
import { errorText } from "../../lib/errors";
import type { EventRead, EventWrite } from "../../types";
import CalendarView from "../calendar/CalendarView";

/** The client's own calendar. They can add events and change or delete the ones they added. */
export default function MyCalendar({ api }: { api: ClientApi }) {
  const [events, setEvents] = useState<EventRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.events
      .list()
      .then(setEvents)
      .catch((e) => setError(errorText(e)));
  }, [api]);

  const sorted = (list: EventRead[]) => [...list].sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));

  if (error) return <p className="dash-error" role="alert">{error}</p>;
  if (!events) return <p className="dash-empty" role="status">Loading your calendar…</p>;

  return (
    <CalendarView
      role="client"
      events={events}
      onAdd={async (body: EventWrite) => {
        const added = await api.events.add(body);
        setEvents((all) => sorted([...(all ?? []), added]));
      }}
      onEdit={async (id: string, body: EventWrite) => {
        const updated = await api.events.edit(id, body);
        setEvents((all) => sorted((all ?? []).map((e) => (e.id === id ? updated : e))));
      }}
      onRemove={async (event: CalendarEvent) => {
        await api.events.remove(event.id);
        setEvents((all) => (all ?? []).filter((e) => e.id !== event.id));
      }}
    />
  );
}
