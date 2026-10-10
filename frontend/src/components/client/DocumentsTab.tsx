import { formatDate, humanize } from "../../lib/format";
import type { ClientDetail } from "../../types";

interface Props {
  client: ClientDetail;
  onOpen: (id: string) => void;
  onDownload: (id: string, filename: string) => void;
}

export default function DocumentsTab({ client, onOpen, onDownload }: Props) {
  if (client.documents.length === 0) return <p className="dash-empty">No documents.</p>;

  return (
    <ul className="row-list">
      {client.documents.map((d) => (
        <li key={d.id} className="record">
          <div className="record-main">
            <div className="record-title">
              {d.original_filename ?? "Document"} <span className="doc-type">{humanize(d.doc_type)}</span>
            </div>
            <div className="record-details">Added {formatDate(d.created_at.slice(0, 10))}</div>
            {d.ai_summary && <p className="doc-summary">{d.ai_summary}</p>}
            {d.ai_warnings?.map((w) => (
              <p key={w} className="doc-warning">⚠ {w}</p>
            ))}
          </div>
          <div className="doc-actions">
            <button type="button" className="dash-btn dash-btn-quiet" onClick={() => onOpen(d.id)}>View</button>
            <button
              type="button"
              className="dash-btn dash-btn-quiet"
              onClick={() => onDownload(d.id, d.original_filename ?? "document")}
            >
              Download
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
