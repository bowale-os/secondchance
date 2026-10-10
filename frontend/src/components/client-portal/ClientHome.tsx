import { useState } from "react";
import type { ClientApi } from "../../api";
import type { ClientRead } from "../../types";
import ReleaseBadge from "../dashboard/ReleaseBadge";
import OverviewTab from "../client/OverviewTab";
import MyDocuments from "./MyDocuments";
import MyResources from "./MyResources";
import "../dashboard/dashboard.css";
import "../client/client.css";

interface Props {
  client: ClientRead | null;
  api: ClientApi;
  onLogout: () => void;
}

type Tab = "info" | "resources";
const TABS: { id: Tab; label: string }[] = [
  { id: "info", label: "My information" },
  { id: "resources", label: "Places that can help" },
];

export default function ClientHome({ client, api, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("info");

  return (
    <div className="dash">
      <header className="dash-bar">
        <span className="dash-logo">SecondChance</span>
        <button className="dash-btn dash-btn-quiet" onClick={onLogout}>Log out</button>
      </header>

      <main className="dash-main">
        {!client ? (
          <p className="dash-empty" role="status">Loading your information…</p>
        ) : (
          <>
            <div className="client-head">
              <div className="client-head-main">
                <h1>Hello, {client.preferred_name || client.first_name}</h1>
                <p className="client-sub">Here is the information your case worker has on file.</p>
              </div>
              <ReleaseBadge date={client.release_date} />
            </div>
            <div className="tabs portal-tabs" role="tablist" aria-label="Sections">
              {TABS.map((t) => (
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
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="portal-panel">
              {tab === "info" ? (
                <>
                  <section className="dash-panel" aria-label="Your information">
                    <OverviewTab client={client} />
                  </section>
                  <MyDocuments api={api} />
                </>
              ) : (
                <section className="dash-panel" aria-label="Places that can help you">
                  <MyResources client={client} api={api} />
                </section>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
