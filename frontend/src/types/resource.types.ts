/**
 * Frontend types for the Resources tab (shelters, food, jobs, addiction help, classes, events).
 *
 * Most of this is scraped, so facts that are rarely published online are `Tri`
 * ("yes" | "no" | "unknown"). "unknown" is NOT "no": filters must only hide a resource
 * on a definite "no", and the UI shows "unknown" as "Call to confirm".
 *
 * Same conventions as ./enums: UUIDs are strings, datetimes are ISO-8601, times are "HH:MM"
 * (24-hour, local), Optional[...] in Python is `T | null`.
 */

type ValueOf<T> = T[keyof T];

// ---------- Enums ----------
export const ResourceCategory = {
  SHELTER: "shelter",
  FOOD: "food",
  ADDICTION: "addiction",
  CLASSES: "classes",
  EVENTS: "events",
} as const;

export type ResourceCategory = ValueOf<typeof ResourceCategory>;

export const Tri = { YES: "yes", NO: "no", UNKNOWN: "unknown" } as const;
export type Tri = ValueOf<typeof Tri>;

export const Gender = { MEN: "men", WOMEN: "women", ANY: "any", UNKNOWN: "unknown" } as const;
export type Gender = ValueOf<typeof Gender>;

export const CostType = {
  FREE: "free",
  SLIDING_SCALE: "sliding_scale",
  FEE: "fee",
  UNKNOWN: "unknown",
} as const;
export type CostType = ValueOf<typeof CostType>;

export const AccessMethod = {
  WALK_IN: "walk_in",
  APPOINTMENT: "appointment",
  REFERRAL_REQUIRED: "referral_required",
  PHONE_ONLY: "phone_only",
} as const;

export type AccessMethod = ValueOf<typeof AccessMethod>;

export const RecordsPolicy = {
  ACCEPTED: "accepted",
  CASE_BY_CASE: "case_by_case",
  NOT_ACCEPTED: "not_accepted",
  UNKNOWN: "unknown",
} as const;

export type RecordsPolicy = ValueOf<typeof RecordsPolicy>;

export const VerificationStatus = {
  UNVERIFIED: "unverified",
  VERIFIED: "verified",
  FLAGGED: "flagged",
} as const;

export type VerificationStatus = ValueOf<typeof VerificationStatus>;

export const RequiredDocument = {
  PHOTO_ID: "photo_id",
  SSN_CARD: "ssn_card",
  BIRTH_CERTIFICATE: "birth_certificate",
  PROOF_OF_INCOME: "proof_of_income",
  PROOF_OF_ADDRESS: "proof_of_address",
  RELEASE_PAPERS: "release_papers",
  REFERRAL_LETTER: "referral_letter",
} as const;

export type RequiredDocument = ValueOf<typeof RequiredDocument>;

export const FieldSource = {
  SCRAPED: "scraped",
  LLM: "llm",
  CASE_WORKER: "case_worker",
  CLIENT_REPORT: "client_report",
} as const;

export type FieldSource = ValueOf<typeof FieldSource>;

export const Confidence = { HIGH: "high", MEDIUM: "medium", LOW: "low" } as const;
export type Confidence = ValueOf<typeof Confidence>;

export const FoodKind = { PANTRY: "pantry", HOT_MEAL: "hot_meal", SNAP_HELP: "snap_help" } as const;
export type FoodKind = ValueOf<typeof FoodKind>;

export const AddictionSetting = {
  OUTPATIENT: "outpatient",
  INPATIENT: "inpatient",
  SUPPORT_GROUP: "support_group",
} as const;

export type AddictionSetting = ValueOf<typeof AddictionSetting>;


// ---------- Building blocks ----------
export interface LatLng {
  lat: number;
  lng: number;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface OpeningHours {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday (Python weekday), not JS getDay()
  opens: string; // "HH:MM"
  closes: string;
  label: string | null; // e.g. "Bed check-in"
}

export interface TransitStop {
  stop_name: string;
  distance_m: number; // straight-line
  routes: string[];
}

/** How an uncertain field got its value; drives "confirmed by a case worker on…" in the drawer. */
export interface FieldMeta {
  source: FieldSource;
  confidence: Confidence;
  confirmed_at: string | null;
}

/** Server-computed from the client's ID records and documents. Only present in a client context. */
export interface DocumentCheck {
  document: RequiredDocument;
  status: "have" | "missing" | "expired";
}

// ---------- Category details ----------
export interface ShelterDetails {
  check_in_time: string | null;
  curfew: string | null;
  max_stay_days: number | null;
  sober_required: Tri;
}

export interface FoodDetails {
  kind: FoodKind[];
  visit_limit: string | null; // e.g. "Once per week"
}

export interface AddictionDetails {
  setting: AddictionSetting[];
  medication_assisted: Tri;
}

/** Shared by classes and events. */
export interface ClassEventDetails {
  starts_at: string | null; // ISO 8601; null if ongoing
  ends_at: string | null;
  recurrence: string | null; // plain text, e.g. "Every Thursday"
  signup_required: Tri;
}

// ---------- Full resource (detail drawer) ----------
interface ResourceBase {
  id: string;
  name: string;
  description: string | null; // 1-2 plain sentences

  // Where and how to reach it. Hide the button or pin when null.
  address: Address | null; // null for phone-only
  location: LatLng | null;
  phone: string | null; // E.164, use as tel:
  website: string | null;

  // When
  hours: OpeningHours[]; // empty = show hours_note or "Call for hours"
  hours_note: string | null; // e.g. "Usually full by 6 PM"

  // Who it serves
  gender: Gender;
  families_welcome: Tri;
  records_policy: RecordsPolicy;
  restrictions_note: string | null;
  languages: string[]; // ISO codes, e.g. ["en", "es"]
  cost_type: CostType;

  // How to get in
  access_methods: AccessMethod[];
  required_documents: RequiredDocument[];
  /** Has/missing for the current client; null outside a client context. */
  document_checks: DocumentCheck[] | null;

  // Getting there. Computed by the server from location + transit stops.
  near_transit: boolean | null; // nearest stop within 1609 m; null = no location
  nearest_stops: TransitStop[]; // closest first, max 3

  // Can I trust this?
  verification: VerificationStatus;
  source_url: string | null;
  last_verified_at: string | null;
  updated_at: string;
  /** Per-field provenance, keyed by field name, e.g. field_meta["records_policy"]. */
  field_meta: Partial<Record<string, FieldMeta>>;
  /** 0-1 share of commonly findable fields filled in. Staff review queue only. */
  completeness?: number;
}

export type Resource =
  | (ResourceBase & { category: typeof ResourceCategory.SHELTER; details: ShelterDetails })
  | (ResourceBase & { category: typeof ResourceCategory.FOOD; details: FoodDetails })
  | (ResourceBase & { category: typeof ResourceCategory.ADDICTION; details: AddictionDetails })
  | (ResourceBase & { category: typeof ResourceCategory.CLASSES; details: ClassEventDetails })
  | (ResourceBase & { category: typeof ResourceCategory.EVENTS; details: ClassEventDetails });

// ---------- List row ----------
/** Only what a card and a map pin need. Address and phone stay in the detail response. */
export interface ResourceSummary {
  id: string;
  name: string;
  category: ResourceCategory;
  location: LatLng | null; // for map pins without a second fetch
  distance_m: number | null; // from `origin`
  near_transit: boolean | null;
  open_now: boolean | null; // null = hours unknown
  starts_at: string | null; // classes/events only
  verification: VerificationStatus;
}

// ---------- Search ----------
/** Filters never exclude on "unknown"; only on a definite mismatch. */
export interface ResourceQuery {
  q?: string;
  categories?: ResourceCategory[];
  near_transit?: boolean;
  open_now?: boolean;
  no_id_required?: boolean;
  records_accepted?: boolean; // "accepted" or "case_by_case"
  gender?: Gender;
  families?: boolean;
  free_only?: boolean;
  language?: string;
  origin?: LatLng; // client address or office
  radius_m?: number;
  starts_within_days?: number;        // classes/events starting in the next N days ("This week" = 7)
  cursor?: string;
}

export interface ResourceSearchResponse {
  items: ResourceSummary[];
  total: number;
  next_cursor: string | null;
}

// ---------- Client matching (ClientResourcesTab) ----------
export interface AppliedFilter {
  key: keyof ResourceQuery;
  reason: "profile" | "manual"; // drives the "from profile" chip label
}

export interface ClientResourceMatch {
  query: ResourceQuery;
  applied: AppliedFilter[];
  results: ResourceSearchResponse;
}
