/**
 * Why a filter is on "from profile". The server applies the needs mapping
 * (GET /clients/{id}/resources, GET /me/resources); this only explains it, so the
 * chip can say "from profile: no car". Keep the field lists in step with the backend.
 *
 * Recovery is never inferred from medications or medical documents, so it never has a reason here.
 */

import type { ClientDetail, ClientIdRead, ClientRead, ResourceCategory, ResourceQuery } from "../types";
import { daysUntil } from "./format";

const SHELTER_HOUSING = ["shelter", "unstable", "homeless", "transitional"];

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
      return undefined;
    case "near_transit":
      return client.has_transportation === false ? "no car" : undefined;
    case "language":
      return client.language && client.language !== "en" ? "speaks Spanish" : undefined;
    case "no_id_required":
      return "missing ID";
    default:
      return undefined;
  }
}

// ---------- Suggested guides (Learn tab topics) ----------

/** A Common Help topic suggested for a client, with a short reason ("no car"). */
export interface GuideSuggestion {
  topicId: string;
  reason: string;
}

/** ID and benefit records come with GET /clients/{id}; the client portal does not have them, so those checks are skipped. */
type ProfileForGuides = ClientRead & Partial<Pick<ClientDetail, "ids" | "benefits">>;

/** A state ID they hold (not past its date) or have applied for. Lost or expired ones don't count. */
function hasStateId(ids: ClientIdRead[]): boolean {
  return ids.some(
    (i) =>
      i.id_type === "state_id" &&
      (i.status === "applied" || (i.status === "held" && !(i.expires_on && daysUntil(i.expires_on) < 0)))
  );
}

/**
 * Guides to suggest from the profile. Stress and community are never suggested: like Recovery,
 * they are not inferred from medical data, and the case worker chooses them.
 */
export function suggestedGuides(client: ProfileForGuides): GuideSuggestion[] {
  const out: GuideSuggestion[] = [];
  if (client.ids && !hasStateId(client.ids)) out.push({ topicId: "get-id", reason: "no state ID on file" });
  if (client.benefits && !client.benefits.some((b) => b.benefit_type === "snap" && (b.status === "active" || b.status === "pending"))) {
    out.push({ topicId: "snap", reason: "no SNAP on file" });
  }
  if (client.has_transportation === false) out.push({ topicId: "marta", reason: "no car" });
  if (client.employment_status === "seeking" || client.employment_status === "not_working") {
    out.push({ topicId: "job-application", reason: "looking for work" });
  }
  return out;
}
