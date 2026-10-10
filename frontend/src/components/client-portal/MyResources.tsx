import { useCallback } from "react";
import type { ClientApi } from "../../api";
import type { ClientRead, ResourceQuery } from "../../types";
import MatchedResources, { type MatchCopy } from "../resources/MatchedResources";

const COPY: MatchCopy = {
  intro: "Places that can help you. We picked some filters from your information. You can change them.",
  placeholder: "Search for a place",
  profileNote: "from your profile",
  reset: "Go back to my filters",
  empty: "No places found. Try turning off some filters.",
  count: (n) => `${n} ${n === 1 ? "place" : "places"} found`,
};

/** The client's own view of resources matched to them (GET /me/resources). */
export default function MyResources({ client, api }: { client: ClientRead; api: ClientApi }) {
  const loadMatches = useCallback((o: ResourceQuery) => api.resources.mine(o), [api]);
  const loadResource = useCallback((id: string) => api.resources.get(id), [api]);

  return (
    <MatchedResources client={client} loadMatches={loadMatches} loadResource={loadResource} mapGestures={false} copy={COPY} />
  );
}
