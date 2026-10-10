import { useState, type FormEvent } from "react";
import { TYPE_LABEL, TYPE_ORDER, isoDate, type CalendarEvent } from "../../lib/calendar";
import { errorText } from "../../lib/errors";
import type { EventWrite, ObligationType } from "../../types";
import Modal from "./Modal";

interface Props {
  /** The event being changed, or undefined for a new one. */
  event?: CalendarEvent;
  /** Date the form starts on for a new event. */
  startDate: string;
  onSave: (body: EventWrite) => Promise<void>;
  onClose: () => void;
}

/** Add or change one of the client's own events. */
export default function EventForm({ event, startDate, onSave, onClose }: Props) {
  const [what, setWhat] = useState(event?.description ?? "");
  const [type, setType] = useState<ObligationType>(event?.obligation_type ?? "other");
  const [date, setDate] = useState(event?.due_date ?? (startDate >= isoDate(new Date()) ? startDate : isoDate(new Date())));
  const [time, setTime] = useState(event?.due_time?.slice(0, 5) ?? "");
  const [place, setPlace] = useState(event?.location ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!what.trim() || !date) {
      setError("Add what it is and the date so we can remind you.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSave({
        description: what.trim(),
        obligation_type: type,
        due_date: date,
        due_time: time ? `${time}:00` : null,
        location: place.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={event ? "Change event" : "Add an event"} onClose={onClose}>
      <form className="cal-form" onSubmit={submit} noValidate>
        <label className="field">
          What is it?
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Job interview at the warehouse" maxLength={500} autoFocus />
        </label>
        <label className="field">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as ObligationType)}>
            {TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        <div className="cal-form-two">
          <label className="field">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            Time (if there is one)
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label className="field">
          Where
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Name and address" maxLength={300} />
        </label>
        <p className="hint">Your case worker will see this event.</p>
        {error && <p className="dash-error" role="alert">{error}</p>}
        <div className="cal-actions">
          <button type="submit" className="dash-btn" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
