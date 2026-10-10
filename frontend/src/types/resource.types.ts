// src/api/resource.types.ts
// Trimmed to what the resources tab actually renders or filters on.

// ---------- Enums ----------
export type ResourceCategory =
  | "shelter" | "food" | "jobs" | "addiction" | "classes" | "events";

export type Gender = "men" | "women" | "any";
export type CostType = "free" | "sliding_scale" | "fee";
export type AccessMethod = "walk_in" | "appointment" | "referral_required" | "phone_only";
export type VerificationStatus = "verified" | "unverified" | "flagged";
export type RecordsPolicy = "accepted" | "case_by_case" | "not_accepted" | "unknown";

// Matches the client's ID records so the drawer can show "has it / missing".
export type RequiredDocument =
  | "photo_id" | "ssn_card" | "birth_certificate"
  | "proof_of_income" | "proof_of_address" | "release_papers" | "referral_letter";

// ---------- Building blocks ----------
export interface LatLng { lat: number; lng: number; }

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface OpeningHours {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;    // 0 = Monday
  opens: string;                      // "HH:MM", 24-hour, local
  closes: string;
  label?: string;                     // e.g. "Bed check-in"
}

export interface TransitStop {
  stop_name: string;
  distance_m: number;                 // straight-line
  routes: string[];
}

// ---------- Category details ----------
export interface ShelterDetails {
  check_in_time: string | null;       // "HH:MM"
  curfew: string | null;              // "HH:MM"
  max_stay_days: number | null;
  sober_required: boolean;
}

export interface FoodDetails {
  kind: ("pantry" | "hot_meal" | "snap_help")[];
  visit_limit: string | null;         // e.g. "Once per week"
}

export interface JobStep {
  title: string;                      // e.g. "Gather documents"
  detail: string;                     // plain-language instructions
  documents?: RequiredDocument[];     // cross-checked against client IDs
}

export interface JobDetails {
  employer: string;
  pay_note: string | null;            // e.g. "$15-17/hr"
  shift_note: string | null;          // e.g. "Early mornings"
  apply_url: string | null;
  steps: JobStep[];                   // drives the walkthrough stepper
}

export interface AddictionDetails {
  setting: ("outpatient" | "inpatient" | "support_group")[];
  medication_assisted: boolean;
}

export interface ClassEventDetails {
  starts_at: string | null;           // ISO 8601; null if ongoing
  ends_at: string | null;
  recurrence: string | null;          // plain text, e.g. "Every Thursday"
  signup_required: boolean;
}

// ---------- Full resource (detail drawer) ----------
interface ResourceBase {
  id: string;
  name: string;
  description: string;                // 1-2 plain sentences

  // Where and how to reach it
  address: Address | null;            // null for phone-only
  location: LatLng | null;
  phone: string | null;               // E.164
  website: string | null;

  // When
  hours: OpeningHours[];
  hours_note: string | null;          // e.g. "Usually full by 6 PM"

  // Who it serves
  gender: Gender;
  families_welcome: boolean;
  records_policy: RecordsPolicy;
  restrictions_note: string | null;   // plain, non-specific
  languages: string[];                // ISO codes, e.g. ["en", "es"]
  cost_type: CostType;

  // How to get in
  access_methods: AccessMethod[];
  required_documents: RequiredDocument[];

  // Getting there
  near_transit: boolean;              // nearest stop within 1609 m
  nearest_stops: TransitStop[];       // closest first, max 3

  // Can I trust this?
  verification: VerificationStatus;
  source_url: string | null;
  last_verified_at: string | null;    // ISO 8601
  updated_at: string;
}

export type Resource =
  | (ResourceBase & { category: "shelter";   details: ShelterDetails })
  | (ResourceBase & { category: "food";      details: FoodDetails })
  | (ResourceBase & { category: "jobs";      details: JobDetails })
  | (ResourceBase & { category: "addiction"; details: AddictionDetails })
  | (ResourceBase & { category: "classes";   details: ClassEventDetails })
  | (ResourceBase & { category: "events";    details: ClassEventDetails });

// ---------- List row ----------
export interface ResourceSummary {
  id: string;
  name: string;
  category: ResourceCategory;
  location: LatLng | null;            // for map pins without a second fetch
  distance_m: number | null;
  near_transit: boolean;
  open_now: boolean | null;
  starts_at: string | null;           // classes/events only
  verification: VerificationStatus;
}

// ---------- Search ----------
export interface ResourceQuery {
  q?: string;
  categories?: ResourceCategory[];
  near_transit?: boolean;
  open_now?: boolean;
  no_id_required?: boolean;
  records_accepted?: boolean;         // "accepted" or "case_by_case"
  gender?: Gender;
  families?: boolean;
  language?: string;
  origin?: LatLng;                    // client address or office
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
  reason: "profile" | "manual";       // drives the "from profile" chip label
}

export interface ClientResourceMatch {
  query: ResourceQuery;
  applied: AppliedFilter[];
  results: ResourceSearchResponse;
}
