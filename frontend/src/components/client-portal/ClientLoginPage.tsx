import { useState } from "react";
import { errorText } from "../../lib/errors";
import type { ClientLogin } from "../../types";
import "../auth/landing.css";
import "./portal.css";

interface Props {
  onLogin: (body: ClientLogin) => Promise<void>;
  onBack: () => void;
  /** Shown above the form, e.g. "Your session ended." */
  notice?: string | null;
}

export default function ClientLoginPage({ onLogin, onBack, notice }: Props) {
  const [form, setForm] = useState({ first_name: "", last_name: "", pin: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onLogin({ first_name: form.first_name.trim(), last_name: form.last_name.trim(), pin: form.pin });
    } catch (err) {
      setError(errorText(err));
      setForm((f) => ({ ...f, pin: "" }));
      setBusy(false);
    }
  }

  return (
    <div className="landing">
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="landing-header">
        <span className="landing-logo">SecondChance</span>
      </header>

      <main id="main" className="landing-main">
        <form className="login-card" onSubmit={submit}>
          <h1>Client log in</h1>
          <p className="login-lead">Enter your name and the PIN your case worker gave you.</p>

          {notice && <p className="role-notice" role="status">{notice}</p>}
          {error && <p className="landing-error" role="alert">{error}</p>}

          <label className="login-field">
            First name
            <input value={form.first_name} onChange={set("first_name")} autoComplete="given-name" required autoFocus />
          </label>
          <label className="login-field">
            Last name
            <input value={form.last_name} onChange={set("last_name")} autoComplete="family-name" required />
          </label>
          <label className="login-field">
            PIN
            <input
              value={form.pin}
              onChange={set("pin")}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              minLength={4}
              maxLength={8}
              autoComplete="current-password"
              required
            />
          </label>

          <div className="role-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Logging in…" : "Log in"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onBack} disabled={busy}>
              Back
            </button>
          </div>
        </form>
      </main>

      <footer className="landing-footer">
        <p>Forgot your PIN? Ask your case worker.</p>
      </footer>
    </div>
  );
}
