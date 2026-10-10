import type { StaffRead } from "../../types";

export type Section = "clients" | "resources";

/** Top-level navigation, passed down from App to every staff screen. */
export interface AppNav {
  section: Section;
  go: (section: Section) => void;
}

const LINKS: { section: Section; label: string }[] = [
  { section: "clients", label: "My clients" },
  { section: "resources", label: "Resources" },
];

export default function AppBar({ staff, nav, onLogout }: { staff: StaffRead; nav: AppNav; onLogout: () => void }) {
  return (
    <header className="dash-bar">
      <span className="dash-logo">Hacklanta</span>
      <nav className="dash-nav" aria-label="Main">
        {LINKS.map(({ section, label }) => (
          <a
            key={section}
            href={`#${section}`}
            className="dash-nav-link"
            aria-current={nav.section === section ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              nav.go(section);
            }}
          >
            {label}
          </a>
        ))}
      </nav>
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
