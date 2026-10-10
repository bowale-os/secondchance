/** Client request/response shapes (backend: ClientCreate, ClientUpdate, ClientRead, ClientLogin). */

import type { ContactMethod, DocumentStatus, DocumentType, EmploymentStatus, HousingStatus } from "./enums";
import type {
  ClientBenefitRead,
  ClientContactRead,
  ClientIdRead,
  ClientMedicationRead,
  ClientObligationRead,
  ClientBenefitCreate,
  ClientContactCreate,
  ClientIdCreate,
  ClientMedicationCreate,
  ClientObligationCreate,
} from "./profile";

/** Single-valued profile facts shared by create and update. */
interface ClientProfileFields {
  date_of_birth?: string | null;
  email?: string | null;
  preferred_contact_method?: ContactMethod | null;
  address_line?: string | null;
  city?: string | null;
  zip_code?: string | null;
  housing_status?: HousingStatus | null;
  employment_status?: EmploymentStatus | null;
  /** Decimal as a string, e.g. "1200.50". */
  monthly_income?: string | null;
  has_transportation?: boolean | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  notes?: string | null;
}

/** Body of POST /clients. The raw PIN is hashed server-side and never returned. */
export interface ClientCreate extends ClientProfileFields {
  first_name: string;
  last_name: string;
  pin: string;
  preferred_name?: string | null;
  phone?: string | null;
  language?: string;
  state?: string;
  release_date?: string | null;
  ids?: ClientIdCreate[];
  benefits?: ClientBenefitCreate[];
  medications?: ClientMedicationCreate[];
  obligations?: ClientObligationCreate[];
  contacts?: ClientContactCreate[];
  /** Ids from POST /clients/extract; the documents are attached to the new client. */
  document_ids?: string[];
}

export interface ClientUpdate extends ClientProfileFields {
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  phone?: string | null;
  language?: string | null;
  state?: string | null;
  release_date?: string | null;
  is_active?: boolean | null;
}

export interface ClientRead {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  phone: string | null;
  language: string;
  state: string;
  release_date: string | null;
  is_active: boolean;
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
  created_by_staff_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientLogin {
  first_name: string;
  last_name: string;
  pin: string;
}

/** Response of POST /auth/client/login. */
export interface ClientToken {
  access_token: string;
  /** Seconds until the token expires. */
  expires_in: number;
  token_type: string;
}

/** Stored document metadata (no file bytes); open the file with api.documents. */
export interface DocumentListItem {
  id: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  doc_type: DocumentType;
  status: DocumentStatus;
  ai_summary: string | null;
  ai_warnings: string[] | null;
  created_at: string;
}

/** GET /clients/{id}: the client plus every profile row and document. */
export interface ClientDetail extends ClientRead {
  ids: ClientIdRead[];
  benefits: ClientBenefitRead[];
  medications: ClientMedicationRead[];
  obligations: ClientObligationRead[];
  contacts: ClientContactRead[];
  documents: DocumentListItem[];
}
