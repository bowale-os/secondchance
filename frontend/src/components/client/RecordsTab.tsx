import { formatDate } from "../../lib/format";
import type { ClientDetail } from "../../types";
import { recordGroups } from "./recordGroups";

interface Props {
  client: ClientDetail;
  onOpenDocument: (id: string) => void;
}

export default function RecordsTab({ client, onOpenDocument }: Props) {
  const groups = recordGroups(client).filter((g) => g.rows.length > 0);
  const sourceName = (id: string) => client.documents.find((d) => d.id === id)?.original_filename ?? "source";

  if (groups.length === 0) {
    return <p className="dash-empty">No records yet. Records come from the documents uploaded for this client.</p>;
  }

  return (
    <div>
      {groups.map((g) => (
        <section key={g.heading} className="record-group" aria-label={g.heading}>
          <h3>{g.heading}</h3>
          <ul className="row-list">
            {g.rows.map((r) => (
              <li key={r.key} className="record">
                <div className="record-main">
                  <div className="record-title">{r.title}</div>
                  <div className="record-details">{r.details.filter(Boolean).join(" · ")}</div>
                  {r.sourceDocumentId && (
                    <button type="button" className="text-link" onClick={() => onOpenDocument(r.sourceDocumentId!)}>
                      Source: {sourceName(r.sourceDocumentId)}
                    </button>
                  )}
                </div>
                <span className={r.verified ? "status status-ok" : "status status-review"}>
                  {r.verified ? `Verified${r.verifiedAt ? ` · ${formatDate(r.verifiedAt.slice(0, 10))}` : ""}` : "Needs review"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
