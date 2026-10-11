import { useEffect, useState } from "react";
import { useApi } from "../../api";
import type { CalendarEvent } from "../../lib/calendar";
import { errorText } from "../../lib/errors";
import type { StaffEventRead, StaffRead } from "../../types";
import AppShell from "../layout/AppShell";
import type { AppNav } from "../layout/nav";
import CalendarView from "./CalendarView";
import "../dashboard/dashboard.css";

interface Props {
  staff: StaffRead;
  nav: AppNav;
  onSelectClient: (clientId: string) => void;
  onLogout: () => void;
}

/** Every event for every one of my clients. I can mark them done; clients add their own. */
export default function CalendarPage({ staff, nav, onSelectClient, onLogout }: Props) {
  const api = useApi();
  const [events, setEvents] = useState<StaffEventRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.events
      .list()
      .then(setEvents)
      .catch((e) => setError(errorText(e)));
  }, [api]);

  async function setDone(event: CalendarEvent, done: boolean) {
    const ids = event.merged_ids ?? [event.id];
    const updated = await Promise.all(ids.map((id) => api.events.setStatus(id, done ? "done" : "open")));
    setEvents((all) => all?.map((e) => (updated.find((u) => u.id === e.id) ? { ...e, status: done ? "done" : "open" } : e)) ?? null);
  }

  return (
    <AppShell staff={staff} nav={nav} onLogout={onLogout}>
      <main id="dash-main" className="dash-main">
        <div className="dash-title">
          <h1>Calendar</h1>
        </div>
        {error ? (
          <p className="dash-error" role="alert">{error}</p>
        ) : !events ? (
          <p className="dash-empty" role="status">Loading the calendar…</p>
        ) : (
          <CalendarView role="staff" events={events} onSetDone={setDone} onOpenClient={onSelectClient} />
        )}
      </main>
    </AppShell>
  );
}
