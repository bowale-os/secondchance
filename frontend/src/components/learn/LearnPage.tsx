import type { StaffRead } from "../../types";
import AppShell from "../layout/AppShell";
import type { AppNav } from "../layout/nav";
import LearnView from "./LearnView";
import "../dashboard/dashboard.css";

interface Props {
  staff: StaffRead;
  nav: AppNav;
  onLogout: () => void;
}

/** Short videos and guides to share with clients. Sample content until there is a backend for it. */
export default function LearnPage({ staff, nav, onLogout }: Props) {
  return (
    <AppShell staff={staff} nav={nav} onLogout={onLogout}>
      <main id="dash-main" className="dash-main">
        <div className="dash-title">
          <h1>Learn</h1>
        </div>
        <LearnView role="staff" />
      </main>
    </AppShell>
  );
}
