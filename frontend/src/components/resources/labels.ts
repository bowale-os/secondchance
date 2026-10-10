import type { ResourceCategory, VerificationStatus } from "../../types";

export const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  shelter: "Shelter",
  food: "Food",
  jobs: "Fair-chance employers",
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
