import "./login.css";

interface Props {
  onLogin: () => void;
  onSignup: () => void;
  /** Auth0 error to show, if the last login attempt failed. */
  error?: string;
}

const STEPS = [
  ["Upload", "Add the documents your client has: court notices, IDs, benefit letters."],
  ["We read them", "Their profile is filled in for you, with fees and dates pulled out."],
  ["You review", "Check what we found, fix anything wrong, then create the client."],
] as const;

export default function LoginPage({ onLogin, onSignup, error }: Props) {
  return (
    <div className="login">
      <aside className="login-brand">
        <span className="login-logo">SecondChance</span>
        <h1>Help every client rebuild, one document at a time.</h1>
        <ol className="login-steps">
          {STEPS.map(([title, text]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <h2>Case worker sign in</h2>
          <p className="hint">Log in to manage your clients, or create an account to get started.</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="login-primary" onClick={onLogin}>
            Log in
          </button>
          <button type="button" className="secondary login-secondary" onClick={onSignup}>
            Create an account
          </button>
        </div>
      </main>
    </div>
  );
}
