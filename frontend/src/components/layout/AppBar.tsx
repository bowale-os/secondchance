import type { StaffRead } from "../../types";

export default function AppBar({ staff, onLogout }: { staff: StaffRead; onLogout: () => void }) {
  return (
    <header className="dash-bar">
      <span className="dash-logo">Hacklanta</span>
      <div className="dash-user">
        <span>
          <strong>{staff.full_name}</strong>
          {staff.organization_name && <span className="dash-org"> · {staff.organization_name}</span>}
        </span>
        <button className="dash-btn dash-btn-quiet" onClick={onLogout}>Log out</button>
      </div>
    </header>
  );
}
