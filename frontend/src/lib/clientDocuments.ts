import type { ClientDetail, IdType, RequiredDocument } from "../types";
import { daysUntil } from "./format";

/** Whether a client has a document a resource asks for. null = we can't tell from their records. */
export type DocStatus = "has" | "applied" | "missing" | null;

const ID_FOR_DOCUMENT: Partial<Record<RequiredDocument, IdType>> = {
  photo_id: "state_id",
  ssn_card: "ssn_card",
  birth_certificate: "birth_certificate",
};

export function documentStatus(client: ClientDetail, doc: RequiredDocument): DocStatus {
  if (doc === "release_papers") {
    return client.documents.some((d) => d.doc_type === "release_papers") ? "has" : "missing";
  }

  const idType = ID_FOR_DOCUMENT[doc];
  if (!idType) return null; // proof of income / address, referral letter: not tracked

  const ids = client.ids.filter((i) => i.id_type === idType);
  // A photo ID only counts while it's valid.
  const valid = ids.some((i) => i.status === "held" && !(doc === "photo_id" && i.expires_on && daysUntil(i.expires_on) < 0));
  if (valid) return "has";
  if (ids.some((i) => i.status === "applied")) return "applied";
  return "missing";
}

/** Bound to one client, for the drawer and the job walkthrough. */
export const documentChecker = (client: ClientDetail) => (doc: RequiredDocument) => documentStatus(client, doc);
