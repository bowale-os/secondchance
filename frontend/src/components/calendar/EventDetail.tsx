import { useState } from "react";
import { TYPE_LABEL, eventTitle, parseIso, timeText, type CalendarEvent } from "../../lib/calendar";
import { errorText } from "../../lib/errors";
import { formatMoney } from "../../lib/format";
import Modal from "./Modal";

interface Props {
  event: CalendarEvent;
  role: "staff" | "client";
  onClose: () => void;
  /** Case worker: mark done or reopen. */
  onSetDone?: (event: CalendarEvent, done: boolean) => Promise<void>;
  onOpenClient?: (clientId: string) => void;
  /** Client: change or remove an event they added. */
  onEdit?: () => void;
  onRemove?: (event: CalendarEvent) => Promise<void>;
}

const STATUS_TEXT = { open: "Coming up", overdue: "Past due", done: "Done" } as const;

/** Everything about one event, with the few actions the viewer is allowed. */
export default function EventDetail({ event: e, role, onClose, onSetDone, onOpenClient, onEdit, onRemove }: Props) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, closeAfter = false) {
    setError(null);
    setBusy(true);
    try {
      await action();
      if (closeAfter) onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const day = e.due_date ? parseIso(e.due_date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "No date yet";
  const mine = role === "client" && e.added_by_client;

  return (
    <Modal title={eventTitle(e)} onClose={onClose}>
      <dl className="facts cal-facts">
        {e.client_name && <div className="fact"><dt>Client</dt><dd>{e.client_name}</dd></div>}
        <div className="fact"><dt>Type</dt><dd>{TYPE_LABEL[e.obligation_type]}</dd></div>
        <div className="fact"><dt>When</dt><dd>{day}{e.due_time ? `, ${timeText(e)}` : ""}</dd></div>
        {e.location && <div className="fact"><dt>Where</dt><dd>{e.location}</dd></div>}
        {e.amount && <div className="fact"><dt>Amount</dt><dd>{formatMoney(e.amount)}</dd></div>}
        <div className="fact"><dt>Status</dt><dd>{STATUS_TEXT[e.status]}</dd></div>
        <div className="fact"><dt>Added by</dt><dd>{e.added_by_client ? (role === "client" ? "You" : "The client") : "Your case worker"}</dd></div>
      </dl>

      {error && <p className="dash-error" role="alert">{error}</p>}

      <div className="cal-actions">
        {role === "staff" && onSetDone && (
          <button type="button" className="dash-btn" disabled={busy} onClick={() => run(() => onSetDone(e, e.status !== "done"))}>
            {busy ? "Saving…" : e.status === "done" ? "Reopen" : "Mark done"}
          </button>
        )}
        {role === "staff" && onOpenClient && (
          <button type="button" className="dash-btn dash-btn-quiet" onClick={() => onOpenClient(e.client_id)}>Open client</button>
        )}
        {mine && onEdit && <button type="button" className="dash-btn" onClick={onEdit}>Change</button>}
        {mine && onRemove && !confirming && (
          <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setConfirming(true)}>Delete</button>
        )}
        {mine && onRemove && confirming && (
          <>
            <button type="button" className="dash-btn cal-danger" disabled={busy} onClick={() => run(() => onRemove(e), true)}>
              {busy ? "Deleting…" : "Yes, delete it"}
            </button>
            <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setConfirming(false)}>Keep it</button>
          </>
        )}
        <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>Close</button>
      </div>

      {role === "client" && !e.added_by_client && (
        <p className="hint">Your case worker added this one. Ask them if it needs to change.</p>
      )}
    </Modal>
  );
}
