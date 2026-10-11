import type { ReactNode } from "react";
import type { StaffRead } from "../../types";
import { SECTIONS, type AppNav, type Section } from "./nav";
import "./layout.css";

const ICONS: Record<Section, ReactNode> = {
  home: (
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  resources: (
    <>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  learn: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M10 9l5 3-5 3z" />
    </>
  ),
};

function Icon({ section }: { section: Section }) {
  return (
    <svg className="shell-icon" viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[section]}
    </svg>
  );
}

interface Props {
  staff: StaffRead;
  nav: AppNav;
  onLogout: () => void;
  children: ReactNode;
}

/**
 * Frame for every case worker screen: a side rail on laptops, a bottom bar on phones.
 * Screens render their own <main> inside it.
 */
export default function AppShell({ staff, nav, onLogout, children }: Props) {
  return (
    <div className="dash shell">
      <a className="skip-link" href="#dash-main">Skip to main content</a>

      {/* Phones only: the rail's brand and user move up here, the tabs move to the bottom. */}
      <header className="shell-top">
        <span className="dash-logo">SecondChance</span>
        <button className="dash-btn" onClick={nav.onNewClient}>+ New client</button>
        <button className="dash-btn dash-btn-quiet" onClick={onLogout}>Log out</button>
      </header>

      <nav className="shell-rail" aria-label="Main">
        <span className="dash-logo shell-brand">SecondChance</span>
        <button className="dash-btn shell-new" onClick={nav.onNewClient}>+ New client</button>
        <ul className="shell-links">
          {SECTIONS.map(({ section, label }) => (
            <li key={section}>
              <a
                href={`#${section}`}
                className="shell-link"
                aria-current={nav.section === section ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  nav.go(section);
                }}
              >
                <Icon section={section} />
                <span>{label}</span>
                {section === "home" && nav.homeCount > 0 && (
                  <span className="shell-count" aria-label={`${nav.homeCount} to do`}>{nav.homeCount}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
        <div className="shell-user">
          <strong>{staff.full_name}</strong>
          {staff.organization_name && <span className="dash-org">{staff.organization_name}</span>}
          <button className="dash-btn dash-btn-quiet" onClick={onLogout}>Log out</button>
        </div>
      </nav>

      <div className="shell-body">{children}</div>
    </div>
  );
}
