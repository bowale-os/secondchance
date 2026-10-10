import { useCallback, useMemo } from "react";
import { useApi } from "../../api";
import { documentChecker } from "../../lib/clientDocuments";
import type { ClientDetail, ResourceQuery } from "../../types";
import MatchedResources, { type MatchCopy } from "./MatchedResources";

const COPY: MatchCopy = {
  intro: "Filters start from this client's profile. Turn any of them off, or add more.",
  placeholder: "Search by name or service",
  profileNote: "from profile",
  reset: "Reset to profile",
  empty: "No resources match these filters. Try turning some off.",
  count: (n) => `${n} ${n === 1 ? "resource matches" : "resources match"} this client`,
};

/** Fourth tab on ClientPage: resources matched to this client, with their IDs checked. */
export default function ClientResourcesTab({ client }: { client: ClientDetail }) {
  const api = useApi();
  const loadMatches = useCallback((o: ResourceQuery) => api.resources.matchesFor(client.id, o), [api, client.id]);
  const loadResource = useCallback((id: string) => api.resources.get(id), [api]);
  const documentStatus = useMemo(() => documentChecker(client), [client]);

  return (
    <MatchedResources
      client={client}
      loadMatches={loadMatches}
      loadResource={loadResource}
      documentStatus={documentStatus}
      progressScope={client.id}
      mapGestures
      copy={COPY}
    />
  );
}
