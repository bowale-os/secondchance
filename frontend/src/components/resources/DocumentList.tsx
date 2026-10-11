import type { DocumentCheck, RequiredDocument } from "../../types";
import { helpForDocument } from "../../lib/commonHelp";
import GuideLink from "../learn/GuideLink";
import { DOCUMENT_LABELS } from "./labels";

/** Documents to bring. In a client context the server sends `checks`, and each says whether they have it. */
export default function DocumentList({ documents, checks }: { documents: RequiredDocument[]; checks: DocumentCheck[] | null }) {
  return (
    <ul className="res-list">
      {documents.map((d) => {
        const status = checks?.find((c) => c.document === d)?.status ?? null;
        return (
          <li key={d} className={status === "missing" || status === "expired" ? "res-doc-missing" : undefined}>
            {DOCUMENT_LABELS[d]}
            {status === "have" && <span className="res-doc-has"> ✓ on file</span>}
            {status === "expired" && <strong> ✗ expired, renew this first</strong>}
            {status === "missing" && <strong> ✗ missing, get this first</strong>}
            {(status === "missing" || status === "expired") && <GuideLink topic={helpForDocument(d)} />}
          </li>
        );
      })}
    </ul>
  );
}
