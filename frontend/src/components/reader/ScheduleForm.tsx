import { useState } from "react";
import { errorText } from "../../lib/errors";
import type { ActionItem, ObligationTypeValue, ScheduleBody } from "../../types/reader";

const TYPES: { value: ObligationTypeValue; label: string }[] = [
  { value: "check_in", label: "Check-in" },
  { value: "court_date", label: "Court date" },
  { value: "fee", label: "Fee or payment" },
  { value: "report", label: "Report" },
  { value: "other", label: "Other" },
];

/** A first guess from the to-do's words; the case worker confirms or changes it. */
export function guessType(a: ActionItem): ObligationTypeValue {
  const text = `${a.title} ${a.details} ${a.due.text ?? ""}`.toLowerCase();
  if (/court|hearing|judge|summons/.test(text)) return "court_date";
  if (/\$|pay|fee|fine|restitution/.test(text)) return "fee";
  if (/report|form/.test(text)) return "report";
  if (/officer|check.?in|meet|visit|appointment/.test(text)) return "check_in";
  return "other";
}

/** "$1,250.00" in the to-do -> "1250.00", for fees. */
export function guessAmount(a: ActionItem): string {
  const m = `${a.title} ${a.details}`.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/);
  return m ? `${m[1].replace(/,/g, "")}.${m[2] ?? "00"}` : "";
}

interface Props {
  action: ActionItem;
  onSave: (body: ScheduleBody) => Promise<void>;
  onCancel: () => void;
}

/** Add to schedule: pre-filled from the to-do. A date is required; when the paper gave none
 * (or the release date is missing), the case worker enters it here. */
export default function ScheduleForm({ action: a, onSave, onCancel }: Props) {
  const [type, setType] = useState<ObligationTypeValue>(guessType(a));
  const [description, setDescription] = useState([a.title, a.details].filter(Boolean).join(". "));
  const [date, setDate] = useState(a.due.resolvedDate ?? "");
  const [time, setTime] = useState("");
  const [amount, setAmount] = useState(guessAmount(a));
  const [location, setLocation] = useState(a.location ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({
        obligation_type: type,
        description: description.trim(),
        due_date: date,
        due_time: time || null,
        amount: type === "fee" && amount ? amount : null,
        location: location.trim() || null,
      });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const id = `sched-${a.id}`;
  return (
    <form className="schedule-form" onSubmit={submit} aria-label={`Add "${a.title}" to the schedule`}>
      {!a.due.resolvedDate && (
        <p className="action-ask">The paper doesn't give an exact day for this. Enter the date you've confirmed.</p>
      )}
      <label htmlFor={`${id}-type`}>Type</label>
      <select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value as ObligationTypeValue)}>
        {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      <label htmlFor={`${id}-desc`}>What the client needs to do</label>
      <textarea id={`${id}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} required maxLength={2000} />

      <div className="schedule-row">
        <span>
          <label htmlFor={`${id}-date`}>Date</label>
          <input id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </span>
        <span>
          <label htmlFor={`${id}-time`}>Time (optional)</label>
          <input id={`${id}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </span>
        {type === "fee" && (
          <span>
            <label htmlFor={`${id}-amount`}>Amount ($)</label>
            <input id={`${id}-amount`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              pattern="\d+(\.\d{1,2})?" />
          </span>
        )}
      </div>

      <label htmlFor={`${id}-where`}>Where (optional)</label>
      <input id={`${id}-where`} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} />

      {error && <p className="dash-error" role="alert">{error}</p>}
      <div className="reader-pick-buttons">
        <button type="submit" className="dash-btn" disabled={busy}>{busy ? "Adding…" : "Add to schedule"}</button>
        <button type="button" className="dash-btn dash-btn-quiet" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
