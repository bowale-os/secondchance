import { useState } from "react";
import { useApi } from "../../api";
import { errorText } from "../../lib/errors";
import { humanize } from "../../lib/format";
import type { DocumentDraft } from "../../types";

export default function DocumentSummaries({ documents }: { documents: DocumentDraft[] }) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);

  async function view(id: string) {
    setError(null);
    try {
      await api.documents.open(id);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <section className="dash-panel" aria-labelledby="read-heading">
      <div className="dash-panel-head">
        <h2 id="read-heading">What we read</h2>
        <span className="panel-count">
          {documents.length} document{documents.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="row-list">
        {documents.map((doc) => (
          <li key={doc.id} className="nc-record">
            <div className="nc-record-main">
              <div className="nc-record-title">
                <span className="file-name">{doc.original_filename ?? "Document"}</span>
                <span className="badge">{humanize(doc.doc_type)}</span>
              </div>
              {doc.ai_summary && <p className="nc-summary">{doc.ai_summary}</p>}
              {doc.ai_warnings.length > 0 && (
                <ul className="warnings" aria-label="Time-sensitive">
                  {doc.ai_warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" className="dash-btn dash-btn-quiet" onClick={() => view(doc.id)}>
              View original
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="dash-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
