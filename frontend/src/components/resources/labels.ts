import type {
  AccessMethod,
  CostType,
  Gender,
  RecordsPolicy,
  RequiredDocument,
  ResourceCategory,
  Tri,
  VerificationStatus,
} from "../../types";

export const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  shelter: "Shelter",
  food: "Food",
  addiction: "Recovery",
  classes: "Classes",
  events: "Community events",
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as ResourceCategory[];

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  verified: "Verified",
  unverified: "Needs review",
  flagged: "Flagged",
};

const METERS_PER_MILE = 1609.344;

/** Straight-line distance, so always "about": 640 -> "about 0.4 mi". */
export function formatMiles(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  return `about ${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/** ISO date-time -> "Thu, Oct 15 · 6:00 PM" in the viewer's time zone. */
export function formatStart(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

export const DOCUMENT_LABELS: Record<RequiredDocument, string> = {
  photo_id: "Photo ID",
  ssn_card: "Social Security card",
  birth_certificate: "Birth certificate",
  proof_of_income: "Proof of income",
  proof_of_address: "Proof of address",
  release_papers: "Release papers",
  referral_letter: "Referral letter",
};

export const ACCESS_LABELS: Record<AccessMethod, string> = {
  walk_in: "Walk in",
  appointment: "By appointment",
  referral_required: "Referral required",
  phone_only: "Call first",
};

export const RECORDS_LABELS: Record<RecordsPolicy, string> = {
  accepted: "People with records welcome",
  case_by_case: "Records reviewed case by case",
  not_accepted: "Does not accept people with some records",
  unknown: "Records policy unknown",
};

export const GENDER_LABELS: Record<Gender, string> = {
  men: "Men only",
  women: "Women only",
  any: "Anyone",
  unknown: "Who it serves: call to confirm",
};

export const COST_LABELS: Record<CostType, string> = {
  free: "Free",
  sliding_scale: "Sliding scale",
  fee: "Fee",
  unknown: "Cost: call to confirm",
};

/**
 * Text for a yes / no / unknown fact. "unknown" is not "no": it reads "<topic>: call to confirm".
 * Pass null for `no` to say nothing on a definite no.
 */
export function triText(value: Tri, yes: string, no: string | null, topic: string): string | null {
  return value === "yes" ? yes : value === "no" ? no : `${topic}: call to confirm`;
}

/** Monday first, matching OpeningHours.day (0 = Monday). */
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Today as an OpeningHours.day index (0 = Monday). */
export const todayIndex = (): number => (new Date().getDay() + 6) % 7;

/** "18:30" -> "6:30 PM". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "+14045551234" -> "(404) 555-1234"; anything else is shown as stored. */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

/** "es" -> "Spanish". */
export function languageName(code: string): string {
  try {
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** An http(s) link from scraped data, or null. Never lets `javascript:` and other schemes through. */
export function safeLink(url: string | null): { href: string; host: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? { href: u.href, host: u.hostname } : null;
  } catch {
    return null;
  }
}
