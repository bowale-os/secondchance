import { useEffect, useState } from "react";
import type { ClientApi } from "../../api";
import { TYPE_LABEL, eventTitle, isoDate, mergeDuplicates, timeText, type CalendarEvent } from "../../lib/calendar";
import { formatWhen } from "../../lib/format";
import type { CaseWorkerRead, ClientRead, ResourceSummary } from "../../types";
import ReleaseBadge from "../dashboard/ReleaseBadge";
import OverviewTab from "../client/OverviewTab";
import { CATEGORY_LABELS } from "../resources/labels";
import MyDocuments from "./MyDocuments";
import "./portal.css";

interface Props {
  client: ClientRead;
  api: ClientApi;
  /** Jump to another tab (Calendar, Resources). */
  go: (section: "resources" | "calendar") => void;
}

/** The client's Home: what is next, who to call, places open now, then their information and documents. */
export default function ClientToday({ client, api, go }: Props) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [caseWorker, setCaseWorker] = useState<CaseWorkerRead | null>(null);
  const [places, setPlaces] = useState<ResourceSummary[] | null>(null);

  // Each card loads on its own, so one failing never blanks the page.
  useEffect(() => {
    api.events.list().then((all) => setEvents(mergeDuplicates(all))).catch(() => setEvents([]));
    api.auth.caseWorker().then(setCaseWorker).catch(() => setCaseWorker(null));
    api.resources
      .mine()
      .then((m) => setPlaces(m.results.items.filter((r) => r.open_now !== false).slice(0, 3)))
      .catch(() => setPlaces([]));
  }, [api]);

  const today = isoDate(new Date());
  const open = (events ?? []).filter((e) => e.status !== "done");
  const pastDue = open.filter((e) => e.status === "overdue").length;
  const upcoming = open
    .filter((e) => e.status === "open" && e.due_date && e.due_date >= today)
    .sort((a, b) => (a.due_date! + (a.due_time ?? "99")).localeCompare(b.due_date! + (b.due_time ?? "99")));
  const [next, ...later] = upcoming;

  return (
    <>
      <div className="client-head">
        <div className="client-head-main">
          <h1>Hello, {client.preferred_name || client.first_name}</h1>
          <p className="client-sub">Here is what is coming up and who to call.</p>
        </div>
        <ReleaseBadge date={client.release_date} />
      </div>

      <div className="today-grid">
        <section className="dash-panel today-card" aria-labelledby="next-heading">
          <h2 id="next-heading">Next up</h2>
          {!events ? (
            <p className="hint" role="status">Loading…</p>
          ) : next ? (
            <>
              <p className="today-type">{TYPE_LABEL[next.obligation_type]}</p>
              <p className="today-big">{eventTitle(next)}</p>
              <p>{formatWhen(next.due_date!, next.due_time)}{next.due_time ? "" : ` · ${timeText(next)}`}</p>
              {next.location && <p className="hint">{next.location}</p>}
              {later.length > 0 && (
                <div className="today-later">
                  <h3>After that</h3>
                  <ul>
                    {later.slice(0, 2).map((e) => (
                      <li key={e.id}>
                        <span className="today-later-when">{formatWhen(e.due_date!, e.due_time)}</span>
                        <span>{eventTitle(e)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button type="button" className="dash-btn dash-btn-quiet" onClick={() => go("calendar")}>See my calendar</button>
            </>
          ) : (
            <>
              <p>Nothing coming up.</p>
              <button type="button" className="dash-btn dash-btn-quiet" onClick={() => go("calendar")}>Add something to my calendar</button>
            </>
          )}
          {pastDue > 0 && (
            <p className="today-late" role="status">
              {pastDue} {pastDue === 1 ? "thing is" : "things are"} past due. Call your case worker if you need help.
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
                <p className="hint">No phone number on file.</p>
              )}
              <p className="today-email"><span className="hint">Email</span> {caseWorker.email}</p>
            </>
          ) : (
            <p className="hint">Your case worker's details will show here.</p>
          )}
        </section>

        <section className="dash-panel today-card today-wide" aria-labelledby="near-heading">
          <h2 id="near-heading">Open near you</h2>
          {!places ? (
            <p className="hint" role="status">Loading…</p>
          ) : places.length === 0 ? (
            <p className="hint">No places to show right now.</p>
          ) : (
            <ul className="today-places">
              {places.map((p) => (
                <li key={p.id}>
                  <span className="today-big">{p.name}</span>
                  <span className="hint">{CATEGORY_LABELS[p.category]}{p.open_now ? " · Open now" : ""}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="dash-btn dash-btn-quiet" onClick={() => go("resources")}>See all places that can help</button>
        </section>
      </div>

      <section className="dash-panel" aria-label="My information">
        <div className="dash-panel-head"><h2>My information</h2></div>
        <OverviewTab client={client} />
      </section>
      <MyDocuments api={api} />
    </>
  );
}
