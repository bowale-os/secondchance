/**
 * Enum values mirror backend/app/tables.py. Each is a const object plus a union
 * type of the same name, so `DocumentType.COURT_NOTICE` and `DocumentType` both work.
 */

type ValueOf<T> = T[keyof T];

export const StaffRole = {
  CASE_WORKER: "case_worker",
} as const;
export type StaffRole = ValueOf<typeof StaffRole>;

export const DocumentType = {
  SUPERVISION_PAPERS: "supervision_papers",
  COURT_NOTICE: "court_notice",
  PAYMENT_NOTICE: "payment_notice",
  MONTHLY_REPORT: "monthly_report",
  RELEASE_PAPERS: "release_papers",
  MEDICAL_DISCHARGE: "medical_discharge",
  BENEFITS_LETTER: "benefits_letter",
  ID_DOCUMENT: "id_document",
  HOUSING_AGREEMENT: "housing_agreement",
  PROGRAM_CERTIFICATE: "program_certificate",
  OTHER: "other",
} as const;
export type DocumentType = ValueOf<typeof DocumentType>;

export const ContactMethod = {
  SMS: "sms",
  CALL: "call",
  WEB: "web",
} as const;
export type ContactMethod = ValueOf<typeof ContactMethod>;

export const HousingStatus = {
  HOUSED: "housed",
  SHELTER: "shelter",
  TRANSITIONAL: "transitional",
  WITH_FAMILY: "with_family",
  UNSTABLE: "unstable",
  HOMELESS: "homeless",
} as const;
export type HousingStatus = ValueOf<typeof HousingStatus>;

export const EmploymentStatus = {
  EMPLOYED: "employed",
  SEEKING: "seeking",
  NOT_WORKING: "not_working",
  DISABLED: "disabled",
  STUDENT: "student",
} as const;
export type EmploymentStatus = ValueOf<typeof EmploymentStatus>;

export const IdType = {
  STATE_ID: "state_id",
  SSN_CARD: "ssn_card",
  BIRTH_CERTIFICATE: "birth_certificate",
  OTHER: "other",
} as const;
export type IdType = ValueOf<typeof IdType>;

export const IdStatus = {
  HELD: "held",
  LOST: "lost",
  EXPIRED: "expired",
  APPLIED: "applied",
} as const;
export type IdStatus = ValueOf<typeof IdStatus>;

export const BenefitType = {
  SNAP: "snap",
  MEDICAID: "medicaid",
  SSI: "ssi",
  OTHER: "other",
} as const;
export type BenefitType = ValueOf<typeof BenefitType>;

export const BenefitStatus = {
  ACTIVE: "active",
  PENDING: "pending",
  DENIED: "denied",
  EXPIRED: "expired",
  NOT_APPLIED: "not_applied",
} as const;
export type BenefitStatus = ValueOf<typeof BenefitStatus>;

export const ObligationType = {
  FEE: "fee",
  COURT_DATE: "court_date",
  CHECK_IN: "check_in",
  REPORT: "report",
} as const;
export type ObligationType = ValueOf<typeof ObligationType>;

export const ObligationStatus = {
  OPEN: "open",
  DONE: "done",
  OVERDUE: "overdue",
} as const;
export type ObligationStatus = ValueOf<typeof ObligationStatus>;

export const ContactType = {
  PAROLE_OFFICER: "parole_officer",
  DOCTOR: "doctor",
  LANDLORD: "landlord",
  EMPLOYER: "employer",
  OTHER: "other",
} as const;
export type ContactType = ValueOf<typeof ContactType>;

export const DocumentStatus = {
  UPLOADED: "uploaded",
  PROCESSING: "processing",
  READ: "read",
  CONFIRMED: "confirmed",
  FAILED: "failed",
} as const;
export type DocumentStatus = ValueOf<typeof DocumentStatus>;
