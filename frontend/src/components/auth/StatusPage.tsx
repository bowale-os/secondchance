import "../client-portal/portal.css";
import "./landing.css";
import "./signup.css";

type Props =
  | { loading: string; error?: undefined; onLogout?: undefined }
  | { loading?: undefined; error: string; onLogout: () => void };

/** Full-page waiting and failure states for sign-in, in the same style as the landing page. */
export default function StatusPage({ loading, error, onLogout }: Props) {
  return (
    <div className="landing">
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="landing-header">
        <span className="landing-logo">SecondChance</span>
      </header>

      <main id="main" className="landing-main">
        {loading !== undefined ? (
          <div className="login-card status-card" role="status" aria-live="polite">
            <span className="status-spinner" aria-hidden="true" />
            <p>{loading}</p>
          </div>
        ) : (
          <div className="login-card status-card">
            <h1>We couldn't sign you in</h1>
            <p className="landing-error" role="alert">{error}</p>
            <div className="role-actions">
              <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                Try again
              </button>
              <button type="button" className="btn btn-secondary" onClick={onLogout}>
                Log out
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
