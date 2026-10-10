import "./landing.css";

interface Props {
  onLogin: () => void;
  onSignup: () => void;
  onClientLogin: () => void;
  /** Auth0 error to show, if the last login attempt failed. */
  error?: string;
}

export default function LandingPage({ onLogin, onSignup, onClientLogin, error }: Props) {
  return (
    <div className="landing">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="landing-header">
        <span className="landing-logo">SecondChance</span>
      </header>

      <main id="main" className="landing-main">
        <div className="landing-intro">
          <h1>A simpler way to manage money and paperwork</h1>
          <p>Choose who you are to get started.</p>
        </div>

        {error && (
          <p className="landing-error" role="alert">
            <strong>Sign in did not work.</strong> {error}
          </p>
        )}

        <div className="role-grid">
          <section className="role-card" aria-labelledby="client-heading">
            <h2 id="client-heading">I am a client</h2>
            <p>See your information and documents. Your case worker sets up your account.</p>
            <div className="role-actions">
              <button type="button" className="btn btn-primary" onClick={onClientLogin}>
                Client log in
              </button>
            </div>
          </section>

          <section className="role-card" aria-labelledby="worker-heading">
            <h2 id="worker-heading">I am a case worker</h2>
            <p>Add clients, upload their documents, and keep their details up to date.</p>
            <div className="role-actions">
              <button type="button" className="btn btn-primary" onClick={onLogin}>
                Case worker log in
              </button>
              <button type="button" className="btn btn-secondary" onClick={onSignup}>
                Create a case worker account
              </button>
            </div>
          </section>
        </div>

        <ul className="trust-list">
          <li>Your documents stay private.</li>
          <li>Free to use.</li>
          <li>Works on your phone.</li>
        </ul>
      </main>

      <footer className="landing-footer">
        <p>Need help signing in? Ask your case worker.</p>
      </footer>
    </div>
  );
}
