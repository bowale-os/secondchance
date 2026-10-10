/**
 * Client profile child rows (backend: ClientId, ClientBenefit, ClientMedication,
 * ClientObligation, ClientContact). *Create shapes are sent with a new client;
 * *Read shapes come back from the API.
 *
 * Decimal amounts are strings on the wire ("250.00") to avoid float rounding.
 */

import type {
  BenefitStatus,
  BenefitType,
  ContactType,
  IdStatus,
  IdType,
  ObligationStatus,
  ObligationType,
} from "./enums";

/** Fields every child row carries about where it came from and who confirmed it. */
interface Provenance {
  source_document_id: string | null;
  verified: boolean;
  verified_by_staff_id: string | null;
  verified_at: string | null;
}

// ---------- Create ----------

export interface ClientIdCreate {
  id_type: IdType;
  status?: IdStatus;
  expires_on?: string | null;
  source_document_id?: string | null;
}

export interface ClientBenefitCreate {
  benefit_type: BenefitType;
  status?: BenefitStatus;
  case_number?: string | null;
  source_document_id?: string | null;
}

export interface ClientMedicationCreate {
  name: string;
  dose?: string | null;
  prescriber?: string | null;
  pharmacy?: string | null;
  next_refill_on?: string | null;
  source_document_id?: string | null;
}

export interface ClientObligationCreate {
  obligation_type: ObligationType;
  description?: string | null;
  amount?: string | null;
  due_date?: string | null;
  status?: ObligationStatus;
  source_document_id?: string | null;
}

export interface ClientContactCreate {
  contact_type: ContactType;
  name: string;
  phone?: string | null;
  email?: string | null;
  source_document_id?: string | null;
}

// ---------- Read ----------

export interface ClientIdRead extends Provenance {
  id: string;
  client_id: string;
  id_type: IdType;
  status: IdStatus;
  expires_on: string | null;
}

export interface ClientBenefitRead extends Provenance {
  id: string;
  client_id: string;
  benefit_type: BenefitType;
  status: BenefitStatus;
  case_number: string | null;
}

export interface ClientMedicationRead extends Provenance {
  id: string;
  client_id: string;
  name: string;
  dose: string | null;
  prescriber: string | null;
  pharmacy: string | null;
  next_refill_on: string | null;
}

export interface ClientObligationRead extends Provenance {
  id: string;
  client_id: string;
  obligation_type: ObligationType;
  description: string | null;
  amount: string | null;
  due_date: string | null;
  status: ObligationStatus;
}

export interface ClientContactRead extends Provenance {
  id: string;
  client_id: string;
  contact_type: ContactType;
  name: string;
  phone: string | null;
  email: string | null;
}
