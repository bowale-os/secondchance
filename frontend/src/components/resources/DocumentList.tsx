import type { DocStatus } from "../../lib/clientDocuments";
import type { RequiredDocument } from "../../types";
import { DOCUMENT_LABELS } from "./labels";

/** Documents to bring; with a client selected, each says whether they have it. */
export default function DocumentList({
  documents,
  documentStatus,
}: {
  documents: RequiredDocument[];
  documentStatus?: (doc: RequiredDocument) => DocStatus;
}) {
  return (
    <ul className="res-list">
      {documents.map((d) => {
        const status = documentStatus?.(d) ?? null;
        return (
          <li key={d} className={status === "missing" ? "res-doc-missing" : undefined}>
            {DOCUMENT_LABELS[d]}
            {status === "has" && <span className="res-doc-has"> ✓ on file</span>}
            {status === "applied" && <span className="res-doc-applied"> · applied, in progress</span>}
            {status === "missing" && <strong> ✗ missing, get this first</strong>}
          </li>
        );
      })}
    </ul>
  );
}
