import type { ClientRead } from "../../types";
import ReleaseBadge from "./ReleaseBadge";

export const initials = (c: ClientRead) => `${c.first_name[0] ?? ""}${c.last_name[0] ?? ""}`.toUpperCase();

export default function ClientRows({ clients, onSelect }: { clients: ClientRead[]; onSelect: (id: string) => void }) {
  return (
    <ul className="row-list">
      {clients.map((c) => (
        <li key={c.id}>
          <button className="client-row" onClick={() => onSelect(c.id)}>
            <span className="avatar" aria-hidden="true">{initials(c)}</span>
            <span className="client-main">
              <span className="client-name">{c.preferred_name || c.first_name} {c.last_name}</span>
              <span className="client-phone">{c.phone ?? "No phone"}</span>
            </span>
            <ReleaseBadge date={c.release_date} />
            <span className="chevron" aria-hidden="true">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
