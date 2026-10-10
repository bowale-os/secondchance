import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useApi } from "../../api";
import { errorText } from "../../lib/errors";
import type { ClientRead, TextingChannel, TextingStatus } from "../../types";

const CHANNEL_LABEL: Record<TextingChannel, string> = {
  imessage: "iMessage",
  rcs: "RCS",
  sms: "SMS",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  other: "Text",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

type Mode = "view" | "form" | "confirm-off";

/** Overview card: turn the text bot on for this client, see its state, unlock, or turn off. */
export default function TextingCard({ client }: { client: ClientRead }) {
  const api = useApi();
  const ids = useId();
  const [status, setStatus] = useState<TextingStatus | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () => api.texting.status(client.id).then(setStatus).catch((e) => setError(errorText(e))),
    [api, client.id]
  );
  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<TextingStatus>, done: (s: TextingStatus) => string | null) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const next = await action();
      setStatus(next);
      setMode("view");
      setNotice(done(next));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function openForm() {
    setPhone(client.phone ?? "");
    setConsent(false);
    setError(null);
    setNotice(null);
    setMode("form");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    run(
      () => api.texting.enroll(client.id, { phone, consent }),
      (s) =>
        s.welcome_sent
          ? "Texting is on. A welcome text was sent."
          : "Texting is on, but the welcome text couldn't be sent. The texting service may be offline; the client can still text in."
    );
  }

  const on = status?.enrolled === true;
  const state = on ? status!.status : null;

  return (
    <section className="texting-card" aria-labelledby={`${ids}-title`}>
      <div className="texting-head">
        <h3 id={`${ids}-title`}>Texting</h3>
        {status && <StateBadge status={status} />}
      </div>

      <div role="status" aria-live="polite">
        {notice && <p className="texting-notice">{notice}</p>}
      </div>
      {error && <p className="texting-error" role="alert">{error}</p>}

      {!status ? (
        !error && <p className="fact-missing">Loading…</p>
      ) : mode === "form" ? (
        <form className="texting-form" onSubmit={submit}>
          <label htmlFor={`${ids}-phone`}>Client's mobile number</label>
          <input
            id={`${ids}-phone`}
            className="dash-search"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(404) 555-0100"
            aria-describedby={`${ids}-phone-hint`}
          />
          <p id={`${ids}-phone-hint`} className="texting-hint">
            US numbers can skip the +1. The bot only answers this number.
          </p>
          <label className="texting-check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            <span>The client agreed to get texts at this number.</span>
          </label>
          <p className="texting-hint">
            We'll send a welcome text with no personal details. The client signs in with their name and PIN.
          </p>
          <div className="texting-actions">
            <button type="submit" className="dash-btn" disabled={busy || !consent || !phone.trim()}>
              {busy ? "Saving…" : on ? "Save number" : "Turn on texting"}
            </button>
            <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setMode("view")} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : mode === "confirm-off" ? (
        <div className="texting-confirm">
          <p>Turn off texting? The bot will stop answering this number.</p>
          <div className="texting-actions">
            <button
              type="button"
              className="dash-btn dash-btn-danger"
              disabled={busy}
              onClick={() => run(() => api.texting.turnOff(client.id), () => "Texting is off.")}
            >
              {busy ? "Turning off…" : "Turn off"}
            </button>
            <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setMode("view")} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : !on ? (
        <div className="texting-body">
          <p>Let this client check their schedule and find help by text, after signing in with their name and PIN.</p>
          <div className="texting-actions">
            <button type="button" className="dash-btn" onClick={openForm}>Set up texting</button>
          </div>
        </div>
      ) : (
        <div className="texting-body">
          <p>
            Number ending in <strong>{status.phone_last4}</strong>
            {status.channel && <> · last seen on {CHANNEL_LABEL[status.channel]}</>}
            {status.consent_at && <> · consent recorded {formatDateTime(status.consent_at)}</>}
          </p>

          {state === "locked" && (
            <p className="texting-attn">
              Too many wrong name or PIN attempts
              {status.locked_at && <> on {formatDateTime(status.locked_at)}</>}. Confirm it's really the client
              before unlocking. To change their PIN, edit their profile; PINs can't be reset by text.
            </p>
          )}
          {state === "stopped" && (
            <p className="texting-hint">
              The client texted STOP, so the bot won't message them. They can text START to turn it back on.
            </p>
          )}

          <div className="texting-actions">
            {state === "locked" && (
              <button
                type="button"
                className="dash-btn"
                disabled={busy}
                onClick={() => run(() => api.texting.unlock(client.id), () => "Unlocked. The client can sign in again.")}
              >
                {busy ? "Unlocking…" : "Unlock texting"}
              </button>
            )}
            <button type="button" className="dash-btn dash-btn-quiet" onClick={openForm} disabled={busy}>
              Change number
            </button>
            <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setMode("confirm-off")} disabled={busy}>
              Turn off
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function StateBadge({ status }: { status: TextingStatus }) {
  if (!status.enrolled) return <span className="status texting-off">Off</span>;
  switch (status.status) {
    case "active":
      return <span className="status status-ok">On</span>;
    case "locked":
      return <span className="status status-review">Locked</span>;
    case "stopped":
      return <span className="status texting-off">Client opted out</span>;
    default:
      return <span className="status texting-off">Off</span>;
  }
}
