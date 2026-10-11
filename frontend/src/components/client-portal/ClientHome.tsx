import { useMemo, useState } from "react";
import type { ClientApi } from "../../api";
import type { ClientRead, ResourceQuery } from "../../types";
import LearnView from "../learn/LearnView";
import AppShell from "../layout/AppShell";
import type { AppNav, Section } from "../layout/nav";
import ClientToday from "./ClientToday";
import MyCalendar from "./MyCalendar";
import MyResources from "./MyResources";
import "../dashboard/dashboard.css";
import "../client/client.css";

interface Props {
  client: ClientRead | null;
  api: ClientApi;
  onLogout: () => void;
}

const TITLES: Record<Exclude<Section, "home">, string> = {
  resources: "Places that can help",
  calendar: "My calendar",
  learn: "Learn",
};

/** The client portal: same side rail and four tabs as the case worker app. */
export default function ClientHome({ client, api, onLogout }: Props) {
  const [section, setSection] = useState<Section>("home");
  // Set by "Find SNAP help nearby" on Learn; cleared when the client picks a tab themselves.
  const [resourceStart, setResourceStart] = useState<ResourceQuery | undefined>();

  // Clients have no "new client" button and no to-do count.
  const nav = useMemo<AppNav>(
    () => ({
      section,
      go: (s: Section) => {
        setResourceStart(undefined);
        setSection(s);
      },
      homeCount: 0,
      setHomeCount: () => {},
    }),
    [section],
  );

  function findNearby(filters: ResourceQuery) {
    setResourceStart(filters);
    setSection("resources");
  }

  const name = client ? client.preferred_name || client.first_name : "You";

  return (
    <AppShell user={{ name, detail: "Client" }} nav={nav} onLogout={onLogout}>
      <main id="dash-main" className="dash-main">
        {!client ? (
          <p className="dash-empty" role="status">Loading your information…</p>
        ) : section === "home" ? (
          <ClientToday client={client} api={api} go={nav.go} />
        ) : (
          <>
            <div className="dash-title">
              <h1>{TITLES[section]}</h1>
            </div>
            {section === "calendar" && <MyCalendar api={api} />}
            {section === "learn" && <LearnView role="client" onFindNearby={findNearby} />}
            {section === "resources" && (
              <section className="dash-panel" aria-label="Places that can help you">
                <MyResources key={resourceStart ? "guide" : "mine"} client={client} api={api} initialOverrides={resourceStart} />
              </section>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
