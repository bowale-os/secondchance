import { useEffect, useMemo, useState } from "react";
import { useApi } from "../../api";
import { errorText } from "../../lib/errors";
import { daysUntil } from "../../lib/format";
import type { ClientRead, StaffRead } from "../../types";
import AppBar from "../layout/AppBar";
import ClientRows from "./ClientRows";
import StatTile from "./StatTile";
import "./dashboard.css";

interface Props {
  staff: StaffRead;
  onNewClient: () => void;
  onSelectClient: (id: string) => void;
  onLogout: () => void;
}

const SOON_DAYS = 30;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Dashboard({ staff, onNewClient, onSelectClient, onLogout }: Props) {
  const api = useApi();
  const [clients, setClients] = useState<ClientRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.clients
      .listMine()
      .then(setClients)
      .catch((e) => setError(errorText(e)));
  }, [api]);

  const stats = useMemo(() => {
    const list = clients ?? [];
    return {
      total: list.length,
      releasingSoon: list.filter((c) => c.release_date && daysUntil(c.release_date) >= 0 && daysUntil(c.release_date) <= SOON_DAYS).length,
      noPhone: list.filter((c) => !c.phone).length,
    };
  }, [clients]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !clients) return clients;
    return clients.filter((c) =>
      [c.first_name, c.last_name, c.preferred_name, c.phone].some((v) => v?.toLowerCase().includes(q))
    );
  }, [clients, query]);

  const firstName = staff.full_name.split(" ")[0];

  return (
    <div className="dash">
      <a className="skip-link" href="#dash-main">Skip to main content</a>
      <AppBar staff={staff} onLogout={onLogout} />

      <main id="dash-main" className="dash-main">
        <div className="dash-title">
          <h1>{greeting()}, {firstName}</h1>
          <button className="dash-btn" onClick={onNewClient}>+ New client</button>
        </div>

        <div className="stat-grid">
          <StatTile value={clients ? stats.total : "–"} label="Clients" />
          <StatTile value={clients ? stats.releasingSoon : "–"} label={`Out in ${SOON_DAYS} days`} tone={stats.releasingSoon ? "attention" : undefined} />
          <StatTile value={clients ? stats.noPhone : "–"} label="No phone on file" tone={stats.noPhone ? "attention" : undefined} />
        </div>

        <section className="dash-panel" aria-labelledby="clients-heading">
          <div className="dash-panel-head">
            <h2 id="clients-heading">My clients</h2>
            <input
              type="search"
              className="dash-search"
              placeholder="Search by name or phone"
              aria-label="Search clients"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!clients?.length}
            />
          </div>

          {error ? (
            <p className="dash-error" role="alert">{error}</p>
          ) : !visible ? (
            <p className="dash-empty" role="status">Loading clients…</p>
          ) : clients?.length === 0 ? (
            <div className="dash-empty">
              <p>No clients assigned yet.</p>
              <button className="dash-btn" onClick={onNewClient}>Add your first client</button>
            </div>
          ) : visible.length === 0 ? (
            <p className="dash-empty">No clients match “{query}”.</p>
          ) : (
            <ClientRows clients={visible} onSelect={onSelectClient} />
          )}
        </section>
      </main>
    </div>
  );
}
