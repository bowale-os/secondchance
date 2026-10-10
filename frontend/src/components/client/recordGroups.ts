import { formatDate, formatMoney, humanize } from "../../lib/format";
import type { ClientDetail } from "../../types";

export interface RecordRow {
  key: string;
  title: string;
  details: (string | null)[];
  verified: boolean;
  verifiedAt: string | null;
  sourceDocumentId: string | null;
}

export interface RecordGroup {
  heading: string;
  rows: RecordRow[];
}

const date = (d: string | null, label: string) => (d ? `${label} ${formatDate(d)}` : null);

export function recordGroups(c: ClientDetail): RecordGroup[] {
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
