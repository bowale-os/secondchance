/** The child rows (IDs, benefits, ...) Gemini found, and how to show and remove them. */

import type {
  ClientBenefitCreate,
  ClientContactCreate,
  ClientDraft,
  ClientIdCreate,
  ClientMedicationCreate,
  ClientObligationCreate,
} from "../types";
import { formatDate, formatMoney, humanize } from "./format";

export interface ExtractedRows {
  ids: ClientIdCreate[];
  benefits: ClientBenefitCreate[];
  medications: ClientMedicationCreate[];
  obligations: ClientObligationCreate[];
  contacts: ClientContactCreate[];
}

export type RowGroupKey = keyof ExtractedRows;

export const rowsFromDraft = (d: ClientDraft): ExtractedRows => ({
  ids: d.ids,
  benefits: d.benefits,
  medications: d.medications,
  obligations: d.obligations,
  contacts: d.contacts,
});

export function removeRow(rows: ExtractedRows, group: RowGroupKey, index: number): ExtractedRows {
  return { ...rows, [group]: rows[group].filter((_, i) => i !== index) };
}

/** Joins the parts that exist: join("Fee", null, "$5") -> "Fee · $5". */
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

const describeId = (r: ClientIdCreate) =>
  join(humanize(r.id_type), r.status && humanize(r.status), r.expires_on && `expires ${formatDate(r.expires_on)}`);

const describeBenefit = (r: ClientBenefitCreate) =>
  join(humanize(r.benefit_type), r.status && humanize(r.status), r.case_number && `case ${r.case_number}`);

const describeMedication = (r: ClientMedicationCreate) =>
  join(r.name, r.dose, r.pharmacy, r.next_refill_on && `refill ${formatDate(r.next_refill_on)}`);

const describeObligation = (r: ClientObligationCreate) =>
  join(
    humanize(r.obligation_type),
    r.description,
    r.amount && formatMoney(r.amount),
    r.due_date && `due ${formatDate(r.due_date)}`
  );

const describeContact = (r: ClientContactCreate) => join(humanize(r.contact_type), r.name, r.phone, r.email);

export interface RowGroupConfig {
  key: RowGroupKey;
  title: string;
  labels: (rows: ExtractedRows) => string[];
}

export const ROW_GROUPS: RowGroupConfig[] = [
  { key: "obligations", title: "Fees, court dates and check-ins", labels: (r) => r.obligations.map(describeObligation) },
  { key: "contacts", title: "Contacts", labels: (r) => r.contacts.map(describeContact) },
  { key: "medications", title: "Medications", labels: (r) => r.medications.map(describeMedication) },
  { key: "benefits", title: "Benefits", labels: (r) => r.benefits.map(describeBenefit) },
  { key: "ids", title: "Identification", labels: (r) => r.ids.map(describeId) },
];
