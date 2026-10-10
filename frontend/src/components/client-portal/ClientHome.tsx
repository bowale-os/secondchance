import type { ClientApi } from "../../api";
import type { ClientRead } from "../../types";
import ReleaseBadge from "../dashboard/ReleaseBadge";
import OverviewTab from "../client/OverviewTab";
import MyDocuments from "./MyDocuments";
import "../dashboard/dashboard.css";
import "../client/client.css";

interface Props {
  client: ClientRead | null;
  api: ClientApi;
  onLogout: () => void;
}

export default function ClientHome({ client, api, onLogout }: Props) {
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
            <section className="dash-panel" aria-label="Your information">
              <OverviewTab client={client} />
            </section>
            <MyDocuments api={api} />
          </>
        )}
      </main>
    </div>
  );
}
