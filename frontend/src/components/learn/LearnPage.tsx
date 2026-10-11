import type { ResourceQuery, StaffRead } from "../../types";
import AppShell, { staffUser } from "../layout/AppShell";
import type { AppNav } from "../layout/nav";
import LearnView from "./LearnView";
import "../dashboard/dashboard.css";

interface Props {
  staff: StaffRead;
  nav: AppNav;
  /** "Find SNAP help nearby": opens Resources with these filters. */
  onFindNearby: (filters: ResourceQuery) => void;
  onLogout: () => void;
}

/** Common Help: hand-picked how-to guides to share with clients. */
export default function LearnPage({ staff, nav, onFindNearby, onLogout }: Props) {
  return (
    <AppShell user={staffUser(staff)} nav={nav} onLogout={onLogout}>
      <main id="dash-main" className="dash-main">
        <div className="dash-title">
          <h1>Learn</h1>
        </div>
        <LearnView role="staff" onFindNearby={onFindNearby} />
      </main>
    </AppShell>
  );
}
