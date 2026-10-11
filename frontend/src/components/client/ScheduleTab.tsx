import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useApi } from "../../api";
import { errorText } from "../../lib/errors";
import { formatDate, humanize } from "../../lib/format";
import { formatDay, formatTime, fromLocalParts, toLocalParts, todayLocal } from "../../lib/localTime";
import type { AppointmentRead, AppointmentWrite, ClientDetail, ScheduleRange } from "../../types";

const COMMON_DOCS = ["State ID", "SSN card", "Birth certificate", "Proof of address", "Pay stub", "Release papers"];

interface Draft {
  title: string;
  date: string;
  start: string;
  end: string;
  location_name: string;
  address: string;
  transit_note: string;
  docs: string[];
  otherDocs: string;
  obligation_id: string;
}

const emptyDraft = (): Draft => ({
  title: "", date: todayLocal(), start: "09:00", end: "", location_name: "", address: "",
  transit_note: "", docs: [], otherDocs: "", obligation_id: "",
});

function draftFrom(a: AppointmentRead): Draft {
  const s = toLocalParts(a.starts_at);
  const docs = a.documents_to_bring ?? [];
  return {
    title: a.title,
    date: s.date,
    start: s.time,
    end: a.ends_at ? toLocalParts(a.ends_at).time : "",
    location_name: a.location_name ?? "",
    address: a.address ?? "",
    transit_note: a.transit_note ?? "",
    docs: docs.filter((d) => COMMON_DOCS.includes(d)),
    otherDocs: docs.filter((d) => !COMMON_DOCS.includes(d)).join(", "),
    obligation_id: a.obligation_id ?? "",
  };
}

function toWrite(d: Draft): AppointmentWrite {
  const other = d.otherDocs.split(",").map((x) => x.trim()).filter(Boolean);
  return {
    title: d.title,
    starts_at: fromLocalParts(d.date, d.start),
    ends_at: d.end ? fromLocalParts(d.date, d.end) : null,
    location_name: d.location_name || null,
    address: d.address || null,
    transit_note: d.transit_note || null,
    documents_to_bring: [...d.docs, ...other],
    obligation_id: d.obligation_id || null,
  };
}

/** Case worker's view of the client's appointments, plus the text the client receives. */
export default function ScheduleTab({ client }: { client: ClientDetail }) {
  const api = useApi();
  const [appts, setAppts] = useState<AppointmentRead[] | null>(null);
  const [includePast, setIncludePast] = useState(false);
  const [editing, setEditing] = useState<AppointmentRead | "new" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewRange, setPreviewRange] = useState<ScheduleRange>("day");
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAppts(await api.appointments.list(client.id, includePast));
    } catch (e) {
      setError(errorText(e));
    }
  }, [api, client.id, includePast]);

  const loadPreview = useCallback(async () => {
    try {
      setPreview((await api.appointments.previewText(client.id, previewRange)).text);
    } catch (e) {
      setPreview(null);
      setError(errorText(e));
    }
  }, [api, client.id, previewRange]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPreview(); }, [loadPreview]);

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
      setEditing(null);
      setConfirmCancel(null);
      setNotice(done);
      await Promise.all([load(), loadPreview()]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const linkable = client.obligations.filter(
    (o) => o.status !== "done" && (o.obligation_type === "court_date" || o.obligation_type === "check_in")
  );

  // Group by local day for the list.
  const groups: { day: string; label: string; items: AppointmentRead[] }[] = [];
  for (const a of appts ?? []) {
    const day = toLocalParts(a.starts_at).date;
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(a);
    else groups.push({ day, label: formatDay(a.starts_at), items: [a] });
  }

  return (
    <div className="panel-body schedule">
      <div className="schedule-main">
        <div className="schedule-head">
          <h3>Appointments</h3>
          <div className="texting-actions">
            <label className="schedule-past">
              <input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} />
              <span>Show last 30 days</span>
            </label>
            {editing === null && (
              <button type="button" className="dash-btn" onClick={() => { setNotice(null); setEditing("new"); }}>
                Add appointment
              </button>
            )}
          </div>
        </div>
        <p className="texting-hint">Times are Eastern (Atlanta). Verified court dates, fees and check-ins also appear on the client's schedule.</p>

        <div role="status" aria-live="polite">{notice && <p className="texting-notice">{notice}</p>}</div>
        {error && <p className="texting-error" role="alert">{error}</p>}

        {editing !== null && (
          <AppointmentForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? emptyDraft() : draftFrom(editing)}
            isNew={editing === "new"}
            busy={busy}
            linkable={linkable}
            onCancel={() => setEditing(null)}
            onSubmit={(d) =>
              editing === "new"
                ? run(() => api.appointments.create(client.id, toWrite(d)), "Appointment added.")
                : run(() => api.appointments.replace(client.id, editing.id, toWrite(d)), "Appointment updated.")
            }
          />
        )}

        {appts === null ? (
          !error && <p className="fact-missing">Loading…</p>
        ) : appts.length === 0 ? (
          <p className="fact-missing">No upcoming appointments.</p>
        ) : (
          groups.map((g) => (
            <section key={g.day} className="schedule-day" aria-label={g.label}>
              <h4>{g.label}</h4>
              <ul className="row-list">
                {g.items.map((a) => (
                  <li key={a.id} className={`record${a.cancelled ? " appt-cancelled" : ""}`}>
                    <div className="record-main">
                      <div className="record-title">
                        <span className="appt-time">
                          {formatTime(a.starts_at)}{a.ends_at && `–${formatTime(a.ends_at)}`}
                        </span>{" "}
                        {a.title}
                        {a.cancelled && <span className="status texting-off appt-badge">Cancelled</span>}
                      </div>
                      {(a.location_name || a.address) && (
                        <div className="record-details">{[a.location_name, a.address].filter(Boolean).join(", ")}</div>
                      )}
                      {a.transit_note && <div className="record-details">Transit: {a.transit_note}</div>}
                      {a.documents_to_bring && a.documents_to_bring.length > 0 && (
                        <div className="record-details">Bring: {a.documents_to_bring.join(", ")}</div>
                      )}
                    </div>
                    <div className="doc-actions">
                      {confirmCancel === a.id ? (
                        <>
                          <span className="appt-confirm">Cancel this appointment?</span>
                          <button type="button" className="dash-btn dash-btn-danger" disabled={busy}
                            onClick={() => run(() => api.appointments.cancel(client.id, a.id), "Appointment cancelled.")}>
                            Yes, cancel
                          </button>
                          <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setConfirmCancel(null)}>
                            Keep
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="dash-btn dash-btn-quiet" disabled={busy}
                            onClick={() => { setNotice(null); setEditing(a); }}>
                            {a.cancelled ? "Restore / edit" : "Edit"}
                          </button>
                          {!a.cancelled && (
                            <button type="button" className="dash-btn dash-btn-quiet" disabled={busy}
                              onClick={() => setConfirmCancel(a.id)}>
                              Cancel
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <aside className="schedule-preview" aria-labelledby="preview-title">
        <h3 id="preview-title">What the client sees</h3>
        <div className="segmented" role="group" aria-label="Preview range">
          {(["day", "tomorrow", "week"] as const).map((r) => (
            <button key={r} type="button" aria-pressed={previewRange === r} onClick={() => setPreviewRange(r)}>
              {r === "day" ? "TODAY" : r.toUpperCase()}
            </button>
          ))}
        </div>
        <pre className="sms-bubble" aria-live="polite">{preview ?? "…"}</pre>
        <p className="texting-hint">Sent only after the client signs in with their name and PIN.</p>
      </aside>
    </div>
  );
}

interface FormProps {
  initial: Draft;
  isNew: boolean;
  busy: boolean;
  linkable: ClientDetail["obligations"];
  onSubmit: (d: Draft) => void;
  onCancel: () => void;
}

function AppointmentForm({ initial, isNew, busy, linkable, onSubmit, onCancel }: FormProps) {
  const id = useId();
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const toggleDoc = (doc: string) =>
    set("docs", d.docs.includes(doc) ? d.docs.filter((x) => x !== doc) : [...d.docs, doc]);
  const endBeforeStart = d.end !== "" && d.end <= d.start;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!endBeforeStart) onSubmit(d);
  }

  const field = (key: "title" | "location_name" | "address" | "transit_note", label: string, extra?: object) => (
    <div className="appt-field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <input id={`${id}-${key}`} className="dash-search" value={d[key]}
        onChange={(e) => set(key, e.target.value)} {...extra} />
    </div>
  );

  return (
    <form className="appt-form" onSubmit={submit} aria-label={isNew ? "New appointment" : "Edit appointment"}>
      {field("title", "What", { required: true, maxLength: 200, placeholder: "Parole check-in" })}
      <div className="appt-row">
        <div className="appt-field">
          <label htmlFor={`${id}-date`}>Date</label>
          <input id={`${id}-date`} type="date" className="dash-search" required value={d.date}
            onChange={(e) => set("date", e.target.value)} />
        </div>
        <div className="appt-field">
          <label htmlFor={`${id}-start`}>Starts</label>
          <input id={`${id}-start`} type="time" className="dash-search" required value={d.start}
            onChange={(e) => set("start", e.target.value)} />
        </div>
        <div className="appt-field">
          <label htmlFor={`${id}-end`}>Ends (optional)</label>
          <input id={`${id}-end`} type="time" className="dash-search" value={d.end}
            aria-invalid={endBeforeStart} aria-describedby={endBeforeStart ? `${id}-end-err` : undefined}
            onChange={(e) => set("end", e.target.value)} />
          {endBeforeStart && <span id={`${id}-end-err`} className="appt-err">Must be after the start time</span>}
        </div>
      </div>
      <div className="appt-row">
        {field("location_name", "Place", { maxLength: 200, placeholder: "Parole office" })}
        {field("address", "Address", { maxLength: 255, placeholder: "2 Peachtree St NW" })}
      </div>
      {field("transit_note", "Getting there (optional)", { maxLength: 255, placeholder: "Five Points station, then the #3 bus" })}

      <fieldset className="appt-docs">
        <legend>Documents to bring</legend>
        <div className="chip-row">
          {COMMON_DOCS.map((doc) => (
            <button key={doc} type="button" className="chip" aria-pressed={d.docs.includes(doc)} onClick={() => toggleDoc(doc)}>
              {d.docs.includes(doc) ? "✓ " : ""}{doc}
            </button>
          ))}
        </div>
        <label htmlFor={`${id}-other`} className="appt-sub">Other (separate with commas)</label>
        <input id={`${id}-other`} className="dash-search" value={d.otherDocs}
          onChange={(e) => set("otherDocs", e.target.value)} />
      </fieldset>

      {linkable.length > 0 && (
        <div className="appt-field">
          <label htmlFor={`${id}-obl`}>Fulfils (optional)</label>
          <select id={`${id}-obl`} className="dash-search" value={d.obligation_id}
            onChange={(e) => set("obligation_id", e.target.value)}>
            <option value="">Nothing linked</option>
            {linkable.map((o) => (
              <option key={o.id} value={o.id}>
                {humanize(o.obligation_type)}{o.due_date ? ` · ${formatDate(o.due_date)}` : ""}
                {o.description ? ` · ${o.description}` : ""}
              </option>
            ))}
          </select>
          <span className="texting-hint">Linking stops the same court date showing twice on the client's schedule.</span>
        </div>
      )}

      <div className="texting-actions">
        <button type="submit" className="dash-btn" disabled={busy || !d.title.trim() || endBeforeStart}>
          {busy ? "Saving…" : isNew ? "Add appointment" : "Save changes"}
        </button>
        <button type="button" className="dash-btn dash-btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
