import { useCallback, useEffect, useState } from "react";
import type { ClientApi } from "../../api";
import { TYPE_LABEL, eventTitle, isoDate, mergeDuplicates, timeText, type CalendarEvent } from "../../lib/calendar";
import { formatWhen } from "../../lib/format";
import { CHECKED, NOT_CHECKED, dueLine } from "../../lib/reader";
import type { UpcomingItem } from "../../types/reader";
import type { CaseWorkerRead, ClientRead } from "../../types";
import ReleaseBadge from "../dashboard/ReleaseBadge";
import OverviewTab from "../client/OverviewTab";
import "./portal.css";

interface Props {
  client: ClientRead;
  api: ClientApi;
  /** Jump to the Calendar tab. */
  go: (section: "calendar") => void;
  /** Open the read flow. */
  onRead: () => void;
  /** Bumped after a paper is kept, so My papers and Next up reload. */
  papersVersion: number;
}

/** The client's Home: what is next, who to call, then their information and documents. */
export default function ClientToday({ client, api, go, onRead, papersVersion }: Props) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [caseWorker, setCaseWorker] = useState<CaseWorkerRead | null>(null);
  const [todos, setTodos] = useState<UpcomingItem[] | null>(null);

  const loadTodos = useCallback(() => {
    api.reader.upcoming().then(setTodos).catch(() => setTodos([]));
  }, [api]);
  useEffect(loadTodos, [loadTodos, papersVersion]);

  // Each card loads on its own, so one failing never blanks the page.
  useEffect(() => {
    api.events.list().then((all) => setEvents(mergeDuplicates(all))).catch(() => setEvents([]));
    api.auth.caseWorker().then(setCaseWorker).catch(() => setCaseWorker(null));
  }, [api]);

  const today = isoDate(new Date());
  const open = (events ?? []).filter((e) => e.status !== "done");
  const pastDue = open.filter((e) => e.status === "overdue").length;
  const next = open
    .filter((e) => e.status === "open" && e.due_date && e.due_date >= today)
    .sort((a, b) => (a.due_date! + (a.due_time ?? "99")).localeCompare(b.due_date! + (b.due_time ?? "99")))[0];
  // To-dos from kept papers count too. Ones a case worker scheduled are already calendar
  // items, so they are skipped here to avoid showing the same thing twice.
  const paperTodos = (todos ?? []).filter((t) => !t.action.checkedByCaseWorker && t.action.due.resolvedDate);
  const nextTodo = paperTodos.find((t) => t.action.due.resolvedDate! >= today);
  const todoFirst = !!nextTodo && (!next || nextTodo.action.due.resolvedDate! < next.due_date!);
  const lateTodos = paperTodos.filter((t) => t.action.due.resolvedDate! < today).length;
  const late = pastDue + lateTodos;

  return (
    <>
      <div className="client-head">
        <div className="client-head-main">
          <h1>Hello, {client.preferred_name || client.first_name}</h1>
          <p className="client-sub">Here is what is coming up and who to call.</p>
          <button type="button" className="dash-btn" onClick={onRead}>Read a paper</button>
        </div>
        <ReleaseBadge date={client.release_date} />
      </div>

      <div className="today-grid">
        <section className="dash-panel today-card" aria-labelledby="next-heading">
          <h2 id="next-heading">Next up</h2>
          {!events || !todos ? (
            <p className="hint" role="status">Loading…</p>
          ) : todoFirst && nextTodo ? (
            <>
              <p className="today-type">From your paper</p>
              <p className="today-big">{nextTodo.action.title}</p>
              <p>{dueLine(nextTodo.action)}</p>
              {nextTodo.action.location && <p className="hint">{nextTodo.action.location}</p>}
              <p className="today-from">
                {nextTodo.paperTitle}. {nextTodo.action.checkedByCaseWorker ? CHECKED : NOT_CHECKED}
              </p>
            </>
          ) : next ? (
            <>
              <p className="today-type">{TYPE_LABEL[next.obligation_type]}</p>
              <p className="today-big">{eventTitle(next)}</p>
              <p>{formatWhen(next.due_date!, next.due_time)}{next.due_time ? "" : ` · ${timeText(next)}`}</p>
              {next.location && <p className="hint">{next.location}</p>}
              <button type="button" className="dash-btn dash-btn-quiet" onClick={() => go("calendar")}>See my calendar</button>
            </>
          ) : (
            <>
              <p>Nothing coming up.</p>
              <button type="button" className="dash-btn dash-btn-quiet" onClick={() => go("calendar")}>Add something to my calendar</button>
            </>
          )}
          {late > 0 && (
            <p className="today-late" role="status">
              {late} {late === 1 ? "thing is" : "things are"} past due. Call your case worker if you need help.
            </p>
          )}
        </section>

        <section className="dash-panel today-card" aria-labelledby="call-heading">
          <h2 id="call-heading">Your case worker</h2>
          {caseWorker ? (
            <>
              <p className="today-big">{caseWorker.full_name}</p>
              {caseWorker.organization_name && <p className="hint">{caseWorker.organization_name}</p>}
              {caseWorker.phone ? (
                <>
                  <p className="today-phone">{caseWorker.phone}</p>
                  <a className="dash-btn today-call" href={`tel:${caseWorker.phone.replace(/[^\d+]/g, "")}`}>Call {caseWorker.full_name.split(" ")[0]}</a>
                </>
              ) : (
                <p className="hint">{caseWorker.email}</p>
              )}
            </>
          ) : (
            <p className="hint">Your case worker's details will show here.</p>
          )}
        </section>
      </div>

      <section className="dash-panel" aria-label="My information">
        <div className="dash-panel-head"><h2>My information</h2></div>
        <OverviewTab client={client} showTexting={false} />
      </section>
    </>
  );
}
