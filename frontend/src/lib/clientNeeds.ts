/**
 * Why a filter is on "from profile". The server applies the needs mapping
 * (GET /clients/{id}/resources, GET /me/resources); this only explains it, so the
 * chip can say "from profile: no car". Keep the field lists in step with the backend.
 *
 * Recovery is never inferred from medications or medical documents, so it never has a reason here.
 */

import type { ClientRead, ResourceCategory, ResourceQuery } from "../types";

const SHELTER_HOUSING = ["shelter", "unstable", "homeless", "transitional"];
const JOB_EMPLOYMENT = ["seeking", "not_working"];

/** Short reason for one profile-applied filter, or undefined if the profile doesn't explain it. */
export function profileReason(
  client: ClientRead,
  key: keyof ResourceQuery,
  category?: ResourceCategory
): string | undefined {
  switch (key) {
    case "categories":
      if (category === "shelter" && client.housing_status && SHELTER_HOUSING.includes(client.housing_status)) {
        return `housing: ${client.housing_status.replace(/_/g, " ")}`;
      }
      if (category === "jobs" && client.employment_status && JOB_EMPLOYMENT.includes(client.employment_status)) {
        return "looking for work";
      }
      return undefined;
    case "near_transit":
      return client.has_transportation === false ? "no car" : undefined;
    case "language":
      return client.language === "es" ? "speaks Spanish" : undefined;
    case "no_id_required":
      return "missing ID";
    default:
      return undefined;
  }
}
