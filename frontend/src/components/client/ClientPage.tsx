import { useCallback, useEffect, useState } from "react";
import { useApi } from "../../api";
import { errorText } from "../../lib/errors";
import type { ClientDetail, StaffRead } from "../../types";
import { initials } from "../dashboard/ClientRows";
import ReleaseBadge from "../dashboard/ReleaseBadge";
import AppBar, { type AppNav } from "../layout/AppBar";
import ClientResourcesTab from "../resources/ClientResourcesTab";
import DocumentsTab from "./DocumentsTab";
import OverviewTab from "./OverviewTab";
import RecordsTab from "./RecordsTab";
import ScheduleTab from "./ScheduleTab";
import { recordGroups } from "./recordGroups";
import "../dashboard/dashboard.css";
import "./client.css";

type Tab = "overview" | "schedule" | "records" | "documents" | "resources";

interface Props {
  clientId: string;
  staff: StaffRead;
  nav: AppNav;
  onBack: () => void;
  onLogout: () => void;
}

export default function ClientPage({ clientId, staff, nav, onBack, onLogout }: Props) {
  const api = useApi();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(
    () => api.clients.get(clientId).then(setClient).catch((e) => setError(errorText(e))),
    [api, clientId]
  );
  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const rows = client ? recordGroups(client).flatMap((g) => g.rows) : [];
  const unverified = rows.filter((r) => !r.verified).length;
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "schedule", label: "Schedule" },
    { id: "records", label: `Records (${rows.length})` },
    { id: "documents", label: `Documents (${client?.documents.length ?? 0})` },
    { id: "resources", label: "Resources" },
  ];

  return (
    <div className="dash">
      <AppBar staff={staff} nav={nav} onLogout={onLogout} />
      <main className="dash-main">
        <div>
          <button type="button" className="dash-btn dash-btn-quiet" onClick={onBack}>‹ My clients</button>
        </div>

        {error && <p className="dash-error" role="alert">{error}</p>}
        {!client ? (
          !error && <p className="dash-empty" role="status">Loading client…</p>
        ) : (
          <>
            <div className="client-head">
              <span className="avatar avatar-lg" aria-hidden="true">{initials(client)}</span>
              <div className="client-head-main">
                <h1>{client.preferred_name || client.first_name} {client.last_name}</h1>
                <p className="client-sub">
                  {[client.phone ?? "No phone", client.state, client.language.toUpperCase()].join(" · ")}
                </p>
              </div>
              <ReleaseBadge date={client.release_date} />
            </div>

            {unverified > 0 ? (
              <div className="review-banner" role="status">
                <span>
                  <strong>{unverified} {unverified === 1 ? "record needs" : "records need"} review.</strong>{" "}
                  Check them against the source documents, then confirm.
                </span>
                <button
                  type="button"
                  className="dash-btn"
                  disabled={busy}
                  onClick={() => run(async () => { await api.clients.confirmAll(clientId); await load(); })}
                >
                  {busy ? "Confirming…" : "Confirm all"}
                </button>
              </div>
            ) : (
              rows.length > 0 && <p className="all-verified">✓ All records verified</p>
            )}

            <section className="dash-panel">
              <div className="tabs" role="tablist" aria-label="Client sections">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`tab-${t.id}`}
                    aria-selected={tab === t.id}
                    aria-controls={`panel-${t.id}`}
                    className="tab"
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === "overview" && <OverviewTab client={client} />}
                {tab === "schedule" && <ScheduleTab client={client} />}
                {tab === "records" && (
                  <RecordsTab client={client} onOpenDocument={(id) => run(() => api.documents.open(id))} />
                )}
                {tab === "documents" && (
                  <DocumentsTab
                    client={client}
                    onOpen={(id) => run(() => api.documents.open(id))}
                    onDownload={(id, name) => run(() => api.documents.download(id, name))}
                  />
                )}
                {tab === "resources" && <ClientResourcesTab client={client} />}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
