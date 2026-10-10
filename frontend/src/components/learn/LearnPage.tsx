import type { StaffRead } from "../../types";
import AppShell from "../layout/AppShell";
import type { AppNav } from "../layout/nav";
import "../dashboard/dashboard.css";

interface Props {
  staff: StaffRead;
  nav: AppNav;
  onLogout: () => void;
}

/** Short videos, guides and articles. Placeholder: there is no content or backend for this yet. */
export default function LearnPage({ staff, nav, onLogout }: Props) {
  return (
    <AppShell staff={staff} nav={nav} onLogout={onLogout}>
      <main id="dash-main" className="dash-main">
        <div className="dash-title">
          <h1>Learn</h1>
        </div>
        <section className="dash-panel" aria-label="Learn">
          <p className="dash-empty">Short videos and plain-language guides for your clients are coming soon.</p>
        </section>
      </main>
    </AppShell>
  );
}
