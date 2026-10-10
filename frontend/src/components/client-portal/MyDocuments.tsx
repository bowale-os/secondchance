import { useEffect, useState } from "react";
import type { ClientApi } from "../../api";
import { errorText } from "../../lib/errors";
import { formatDate, humanize } from "../../lib/format";
import type { DocumentListItem } from "../../types";

export default function MyDocuments({ api }: { api: ClientApi }) {
  const [docs, setDocs] = useState<DocumentListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.auth.documents().then(setDocs).catch((e) => setError(errorText(e)));
  }, [api]);

  const run = (action: () => Promise<unknown>) => action().catch((e) => setError(errorText(e)));

  return (
    <section className="dash-panel" aria-labelledby="my-docs-heading">
      <div className="dash-panel-head">
        <h2 id="my-docs-heading">My documents</h2>
      </div>
      {error ? (
        <p className="dash-error" role="alert">{error}</p>
      ) : !docs ? (
        <p className="dash-empty" role="status">Loading documents…</p>
      ) : docs.length === 0 ? (
        <p className="dash-empty">No documents yet.</p>
      ) : (
        <ul className="row-list">
          {docs.map((d) => (
            <li key={d.id} className="record">
              <div className="record-main">
                <div className="record-title">
                  {d.original_filename ?? "Document"} <span className="doc-type">{humanize(d.doc_type)}</span>
                </div>
                <div className="record-details">Added {formatDate(d.created_at.slice(0, 10))}</div>
              </div>
              <div className="doc-actions">
                <button type="button" className="dash-btn dash-btn-quiet" onClick={() => run(() => api.documents.open(d.id))}>
                  View
                </button>
                <button
                  type="button"
                  className="dash-btn dash-btn-quiet"
                  onClick={() => run(() => api.documents.download(d.id, d.original_filename ?? "document"))}
                >
                  Download
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
