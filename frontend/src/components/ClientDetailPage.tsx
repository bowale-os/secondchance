import { useCallback, useEffect, useState } from "react";
import { useApi } from "../api";
import { errorText } from "../lib/errors";
import { formatDate, formatMoney, humanize } from "../lib/format";
import type { ClientDetail } from "../types";

interface RowView {
  key: string;
  title: string;
  details: (string | null)[];
  verified: boolean;
  verifiedAt: string | null;
  sourceDocumentId: string | null;
}

const date = (d: string | null, label: string) => (d ? `${label} ${formatDate(d)}` : null);

function rowViews(c: ClientDetail): { heading: string; rows: RowView[] }[] {
  return [
    {
      heading: "IDs",
      rows: c.ids.map((r) => ({
        key: r.id, title: humanize(r.id_type), details: [humanize(r.status), date(r.expires_on, "Expires")],
        verified: r.verified, verifiedAt: r.verified_at, sourceDocumentId: r.source_document_id,
      })),
    },
    {
      heading: "Benefits",
      rows: c.benefits.map((r) => ({
        key: r.id, title: humanize(r.benefit_type), details: [humanize(r.status), r.case_number && `Case ${r.case_number}`],
        verified: r.verified, verifiedAt: r.verified_at, sourceDocumentId: r.source_document_id,
      })),
    },
    {
      heading: "Medications",
      rows: c.medications.map((r) => ({
        key: r.id, title: r.name, details: [r.dose, r.prescriber, r.pharmacy, date(r.next_refill_on, "Refill")],
        verified: r.verified, verifiedAt: r.verified_at, sourceDocumentId: r.source_document_id,
      })),
    },
    {
      heading: "Obligations",
      rows: c.obligations.map((r) => ({
        key: r.id, title: humanize(r.obligation_type),
        details: [r.description, r.amount && formatMoney(r.amount), date(r.due_date, "Due"), humanize(r.status)],
        verified: r.verified, verifiedAt: r.verified_at, sourceDocumentId: r.source_document_id,
      })),
    },
    {
      heading: "Contacts",
      rows: c.contacts.map((r) => ({
        key: r.id, title: `${r.name} (${humanize(r.contact_type)})`, details: [r.phone, r.email],
        verified: r.verified, verifiedAt: r.verified_at, sourceDocumentId: r.source_document_id,
      })),
    },
  ];
}

export default function ClientDetailPage({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const api = useApi();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api.clients.get(clientId).then(setClient).catch((e) => setError(errorText(e))),
    [api, clientId]
  );
  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <button type="button" className="secondary" onClick={onBack}>
      ← My clients
    </button>
  );
  if (!client) {
    return (
      <>
        {error ? <p className="error">{error}</p> : <p>Loading client…</p>}
        {back}
      </>
    );
  }

  const groups = rowViews(client);
  const unverified = groups.reduce((n, g) => n + g.rows.filter((r) => !r.verified).length, 0);
  const sourceName = (id: string | null) => client.documents.find((d) => d.id === id)?.original_filename ?? "source";
  const profile: [string, string | null][] = [
    ["Phone", client.phone],
    ["Email", client.email],
    ["Date of birth", client.date_of_birth && formatDate(client.date_of_birth)],
    ["Release date", client.release_date && formatDate(client.release_date)],
    ["Address", [client.address_line, client.city, client.zip_code].filter(Boolean).join(", ") || null],
    ["Housing", client.housing_status && humanize(client.housing_status)],
    ["Employment", client.employment_status && humanize(client.employment_status)],
    ["Monthly income", client.monthly_income && formatMoney(client.monthly_income)],
    ["Emergency contact", [client.emergency_contact_name, client.emergency_contact_phone].filter(Boolean).join(" · ") || null],
    ["Notes", client.notes],
  ];

  return (
    <section>
      {back}
      <h2 className="client-heading">
        {client.preferred_name || client.first_name} {client.last_name}
      </h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        {unverified > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.clients.confirmAll(clientId);
                await load();
              })
            }
          >
            {busy ? "Confirming…" : `Confirm all (${unverified} unverified)`}
          </button>
        ) : (
          groups.some((g) => g.rows.length > 0) && <span className="badge verified">All rows verified</span>
        )}
      </div>

      <h3 className="section-title">Profile</h3>
      <dl className="profile-grid">
        {profile
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>

      {groups
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <div key={g.heading}>
            <h3 className="section-title">{g.heading}</h3>
            <ul className="summary-list">
              {g.rows.map((r) => (
                <li key={r.key} className="summary-item">
                  <div className="summary-title">
                    <span className="file-name">{r.title}</span>
                    <span className={r.verified ? "badge verified" : "badge unverified"}>
                      {r.verified
                        ? `Verified${r.verifiedAt ? ` · ${formatDate(r.verifiedAt.slice(0, 10))}` : ""}`
                        : "Unverified"}
                    </span>
                  </div>
                  <p>{r.details.filter(Boolean).join(" · ")}</p>
                  {r.sourceDocumentId && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => run(() => api.documents.open(r.sourceDocumentId!))}
                    >
                      Source: {sourceName(r.sourceDocumentId)}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

      <h3 className="section-title">Documents</h3>
      {client.documents.length === 0 ? (
        <p className="hint">No documents.</p>
      ) : (
        <ul className="summary-list">
          {client.documents.map((d) => (
            <li key={d.id} className="summary-item">
              <div className="summary-title">
                <span className="file-name">{d.original_filename ?? "Document"}</span>
                <span className="badge">{humanize(d.doc_type)}</span>
                <button type="button" className="secondary" onClick={() => run(() => api.documents.open(d.id))}>
                  View
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => run(() => api.documents.download(d.id, d.original_filename ?? "document"))}
                >
                  Download
                </button>
              </div>
              {d.ai_summary && <p>{d.ai_summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
