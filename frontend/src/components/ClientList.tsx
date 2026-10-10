import { useEffect, useState } from "react";
import { useApi } from "../api";
import { formatDate } from "../lib/format";
import type { ClientRead } from "../types";

const initials = (c: ClientRead) => `${c.first_name[0] ?? ""}${c.last_name[0] ?? ""}`.toUpperCase();

export default function ClientList({ onSelect }: { onSelect: (id: string) => void }) {
  const api = useApi();
  const [clients, setClients] = useState<ClientRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.clients
      .listMine()
      .then(setClients)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [api]);

  if (error) return <p className="error">{error}</p>;
  if (!clients) return <p>Loading clients…</p>;
  if (clients.length === 0) return <p>No clients assigned yet.</p>;

  return (
    <section>
      <h2 className="client-heading">My clients ({clients.length})</h2>
      <ul className="client-list">
        {clients.map((c) => (
          <li key={c.id} className="client-item clickable" onClick={() => onSelect(c.id)}>
            <span className="avatar">{initials(c)}</span>
            <div>
              <div className="client-name">
                {c.preferred_name || c.first_name} {c.last_name}
              </div>
              <div className="client-meta">
                {c.phone ?? "No phone"} · {c.release_date ? `Release ${formatDate(c.release_date)}` : "No release date"}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
