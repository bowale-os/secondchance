/** Converts between Gemini's draft, the editable review form, and the POST /clients body. */

import { blankToNull, type ClientCreate, type ClientDraft, type ContactMethod, type EmploymentStatus, type HousingStatus } from "../types";
import type { ClientFormState } from "./clientFields";
import type { ExtractedRows } from "./extractedRows";

const text = (v: string | null) => v ?? "";

export function formFromDraft(d: ClientDraft): ClientFormState {
  return {
    first_name: text(d.first_name),
    last_name: text(d.last_name),
    preferred_name: text(d.preferred_name),
    phone: text(d.phone),
    language: d.language || "en",
    state: "GA",
    release_date: text(d.release_date),
    date_of_birth: text(d.date_of_birth),
    email: text(d.email),
    preferred_contact_method: text(d.preferred_contact_method),
    address_line: text(d.address_line),
    city: text(d.city),
    zip_code: text(d.zip_code),
    housing_status: text(d.housing_status),
    employment_status: text(d.employment_status),
    monthly_income: text(d.monthly_income),
    has_transportation: d.has_transportation === null ? "" : d.has_transportation ? "yes" : "no",
    emergency_contact_name: text(d.emergency_contact_name),
    emergency_contact_phone: text(d.emergency_contact_phone),
    notes: text(d.notes),
  };
}

const yesNoToBool = (v: string): boolean | null => (v === "yes" ? true : v === "no" ? false : null);

export function buildClientCreate(
  form: ClientFormState,
  pin: string,
  rows: ExtractedRows,
  documentIds: string[]
): ClientCreate {
  return {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    pin,
    preferred_name: blankToNull(form.preferred_name.trim()),
    phone: blankToNull(form.phone.trim()),
    language: form.language.trim() || "en",
    state: form.state.trim().toUpperCase() || "GA",
    release_date: blankToNull(form.release_date),
    date_of_birth: blankToNull(form.date_of_birth),
    email: blankToNull(form.email.trim()),
    preferred_contact_method: blankToNull(form.preferred_contact_method) as ContactMethod | null,
    address_line: blankToNull(form.address_line.trim()),
    city: blankToNull(form.city.trim()),
    zip_code: blankToNull(form.zip_code.trim()),
    housing_status: blankToNull(form.housing_status) as HousingStatus | null,
    employment_status: blankToNull(form.employment_status) as EmploymentStatus | null,
    monthly_income: blankToNull(form.monthly_income),
    has_transportation: yesNoToBool(form.has_transportation),
    emergency_contact_name: blankToNull(form.emergency_contact_name.trim()),
    emergency_contact_phone: blankToNull(form.emergency_contact_phone.trim()),
    notes: blankToNull(form.notes.trim()),
    ...rows,
    document_ids: documentIds,
  };
}
