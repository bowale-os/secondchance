import { useCallback, useMemo, useRef, useState } from "react";
import type { ClientApi } from "../../api";
import type { ClientRead, ResourceQuery } from "../../types";
import LearnView from "../learn/LearnView";
import AppShell from "../layout/AppShell";
import ReadFlow, { LEAVE_WARNING } from "../reader/ReadFlow";
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
  // The read flow replaces the page content; leaving with an unkept result asks first.
  const [reading, setReading] = useState(false);
  const [papersVersion, setPapersVersion] = useState(0);
  const unsaved = useRef(false);
  const onUnsavedChange = useCallback((u: boolean) => { unsaved.current = u; }, []);

  // Clients have no "new client" button and no to-do count.
  const nav = useMemo<AppNav>(
    () => ({
      section,
      go: (s: Section) => {
        if (unsaved.current && !window.confirm(LEAVE_WARNING)) return;
        unsaved.current = false;
        setReading(false);
        setResourceStart(undefined);
        setSection(s);
      },
      homeCount: 0,
      setHomeCount: () => {},
    }),
    [section],
  );

  function closeReader(kept: boolean) {
    unsaved.current = false;
    setReading(false);
    if (kept) setPapersVersion((v) => v + 1);
  }

  const startReading = () => setReading(true);

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
        ) : reading ? (
          <ReadFlow reader={api.reader} language={client.language} onClose={closeReader} onUnsavedChange={onUnsavedChange} />
        ) : section === "home" ? (
          <ClientToday client={client} api={api} go={nav.go} onRead={startReading} papersVersion={papersVersion} />
        ) : (
          <>
            <div className="dash-title">
              <h1>{TITLES[section]}</h1>
              {section === "calendar" && (
                <button type="button" className="dash-btn" onClick={startReading}>Read a paper</button>
              )}
            </div>
            {section === "calendar" && <MyCalendar api={api} />}
            {section === "learn" && <LearnView role="client" client={client} onFindNearby={findNearby} />}
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
