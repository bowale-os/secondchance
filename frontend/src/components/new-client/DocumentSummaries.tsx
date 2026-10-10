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
    <>
      <ul className="summary-list">
        {documents.map((doc) => (
          <li key={doc.id} className="summary-item">
            <div className="summary-title">
              <span className="file-name">{doc.original_filename ?? "Document"}</span>
              <span className="badge">{humanize(doc.doc_type)}</span>
              <button type="button" className="secondary" onClick={() => view(doc.id)}>
                View original
              </button>
            </div>
            {doc.ai_summary && <p>{doc.ai_summary}</p>}
            {doc.ai_warnings.length > 0 && (
              <ul className="warnings">
                {doc.ai_warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
