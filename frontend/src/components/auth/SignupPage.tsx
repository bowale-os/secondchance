import { useState } from "react";
import { errorText } from "../../lib/errors";
import "../client-portal/portal.css";
import "./landing.css";
import "./signup.css";

interface Props {
  /** The email from Auth0; shown read-only. */
  email: string;
  /** Pre-fill from the Auth0 profile, if it has a real name. */
  initialName: string;
  onSubmit: (values: { full_name: string; organization_name: string; phone: string }) => Promise<void>;
  onLogout: () => void;
}

export default function SignupPage({ email, initialName, onSubmit, onLogout }: Props) {
  const [form, setForm] = useState({ full_name: initialName, organization_name: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(errorText(err));
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
        <form className="login-card signup-card" onSubmit={submit}>
          <div className="signup-head">
            <p className="signup-step">Last step</p>
            <h1>Set up your case worker profile</h1>
            <p className="login-lead">Your clients will see this name and organization. You can start adding clients right after.</p>
          </div>

          {error && <p className="landing-error" role="alert">{error}</p>}

          <label className="login-field">
            Email
            <input value={email} disabled readOnly />
            <span className="field-hint">From your sign-in. This can't be changed here.</span>
          </label>
          <label className="login-field">
            Full name <span aria-hidden="true">*</span>
            <input value={form.full_name} onChange={set("full_name")} autoComplete="name" required autoFocus />
          </label>
          <label className="login-field">
            Organization
            <input value={form.organization_name} onChange={set("organization_name")} autoComplete="organization" />
            <span className="field-hint">Optional. For example, your agency or nonprofit.</span>
          </label>
          <label className="login-field">
            Phone
            <input value={form.phone} onChange={set("phone")} type="tel" autoComplete="tel" />
            <span className="field-hint">Optional.</span>
          </label>

          <div className="role-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Creating profile…" : "Create profile"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onLogout} disabled={busy}>
              Log out
            </button>
          </div>
        </form>
      </main>

      <footer className="landing-footer">
        <p>Your information is only shared with the clients you work with.</p>
      </footer>
    </div>
  );
}
