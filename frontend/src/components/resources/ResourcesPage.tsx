import type { StaffRead } from "../../types";
import AppBar, { type AppNav } from "../layout/AppBar";
import "../dashboard/dashboard.css";

interface Props {
  staff: StaffRead;
  nav: AppNav;
  onLogout: () => void;
}

/** Placeholder: search, filters, and result rows come next. */
export default function ResourcesPage({ staff, nav, onLogout }: Props) {
  return (
    <div className="dash">
      <a className="skip-link" href="#dash-main">Skip to main content</a>
      <AppBar staff={staff} nav={nav} onLogout={onLogout} />
      <main id="dash-main" className="dash-main">
        <div className="dash-title">
          <h1>Resources</h1>
        </div>
      </main>
    </div>
  );
}
