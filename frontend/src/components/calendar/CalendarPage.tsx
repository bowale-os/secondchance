import type { StaffRead } from "../../types";
import AppShell from "../layout/AppShell";
import type { AppNav } from "../layout/nav";
import "../dashboard/dashboard.css";

interface Props {
  staff: StaffRead;
  nav: AppNav;
  onLogout: () => void;
}

/** Case worker calendar. Placeholder until the events list is wired up. */
export default function CalendarPage({ staff, nav, onLogout }: Props) {
  return (
    <AppShell staff={staff} nav={nav} onLogout={onLogout}>
      <main id="dash-main" className="dash-main">
        <div className="dash-title">
          <h1>Calendar</h1>
        </div>
        <section className="dash-panel" aria-label="Calendar">
          <p className="dash-empty">Court dates, check-ins and fees for all your clients will show here.</p>
        </section>
      </main>
    </AppShell>
  );
}
