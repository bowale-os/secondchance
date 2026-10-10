/**
 * What POST /clients/extract returns: Gemini's reading of the uploaded documents.
 * Anything the documents did not say is null or an empty list. The case worker
 * completes it, adds a PIN, and sends it to POST /clients as a ClientCreate.
 */

import type { ContactMethod, DocumentType, EmploymentStatus, HousingStatus } from "./enums";
import type {
  ClientBenefitCreate,
  ClientContactCreate,
  ClientIdCreate,
  ClientMedicationCreate,
  ClientObligationCreate,
} from "./profile";

/** An uploaded, not-yet-attached document with Gemini's summary. */
export interface DocumentDraft {
  id: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  doc_type: DocumentType;
  ai_summary: string | null;
  ai_warnings: string[];
}

export interface ClientDraft {
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  phone: string | null;
  language: string | null;
  release_date: string | null;
  date_of_birth: string | null;
  email: string | null;
  preferred_contact_method: ContactMethod | null;
  address_line: string | null;
  city: string | null;
  zip_code: string | null;
  housing_status: HousingStatus | null;
  employment_status: EmploymentStatus | null;
  monthly_income: string | null;
  has_transportation: boolean | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  ids: ClientIdCreate[];
  benefits: ClientBenefitCreate[];
  medications: ClientMedicationCreate[];
  obligations: ClientObligationCreate[];
  contacts: ClientContactCreate[];
  documents: DocumentDraft[];
}
