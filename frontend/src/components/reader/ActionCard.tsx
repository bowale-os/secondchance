import { useState } from "react";
import { ASK_RELEASE_DATE, CHECKED, NOT_CHECKED, dueLine, needsReleaseDate } from "../../lib/reader";
import type { ActionItem, Flag } from "../../types/reader";
import FlagNote from "./FlagNote";

interface Props {
  action: ActionItem;
  flags: Flag[];
  /** Kept papers can be checked off; a reading that isn't kept yet can't. */
  onToggle?: (done: boolean) => Promise<void>;
  /** Shown in Upcoming, where to-dos from several papers are mixed. */
  paperTitle?: string;
}

/** One step from a paper: what to do, when, where, what to bring, who to call, and the
 * sentence on the paper it came from. */
export default function ActionCard({ action: a, flags, onToggle, paperTitle }: Props) {
  const [busy, setBusy] = useState(false);
  const urgent = a.priority === "urgent" && !a.completed;

  async function toggle() {
    if (!onToggle) return;
    setBusy(true);
    try {
      await onToggle(!a.completed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`action-card${urgent ? " action-urgent" : ""}${a.completed ? " action-done" : ""}`}>
      {urgent && <p className="action-badge">Urgent</p>}
      {paperTitle && <p className="hint">From: {paperTitle}</p>}
      <div className="action-title-row">
        <h3 className="action-title">{a.title}</h3>
        {onToggle && (
          <label className={`action-check${a.completed ? " is-checked" : ""}`}>
            <input type="checkbox" checked={a.completed} onChange={toggle} disabled={busy} />
            <span>{a.completed ? "Done" : "Mark done"}</span>
          </label>
        )}
      </div>

      <p className="action-due"><strong>{dueLine(a)}</strong></p>
      {needsReleaseDate(a) ? (
        <p className="action-ask">{ASK_RELEASE_DATE}</p>
      ) : (
        a.due.explanation && <p className="hint">{a.due.explanation}</p>
      )}
      {a.details && <p>{a.details}</p>}
      {a.location && <p><strong>Where:</strong> {a.location}</p>}
      {a.bring?.length ? <p><strong>Bring:</strong> {a.bring.join(", ")}</p> : null}
      {a.contact && (a.contact.name || a.contact.phone || a.contact.email) && (
        <p>
          <strong>Contact:</strong> {[a.contact.name, a.contact.phone, a.contact.email].filter(Boolean).join(" · ")}
        </p>
      )}
      {a.consequence && <p><strong>If you don't:</strong> {a.consequence}</p>}

      <FlagNote flags={flags} />

      <p className="action-label">{a.checkedByCaseWorker ? CHECKED : NOT_CHECKED}</p>
      <blockquote className="action-source">
        <span>From your paper, page {a.sourcePage}:</span> “{a.sourceQuote}”
      </blockquote>
    </li>
  );
}
