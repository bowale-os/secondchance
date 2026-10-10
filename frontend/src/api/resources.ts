import type { ClientResourceMatch, Resource, ResourceQuery, ResourceSearchResponse } from "../types";
import type { Http } from "./http";

/** Backend name for the full resource returned by GET /resources/{id}. */
export type ResourceRead = Resource;

/**
 * ResourceQuery as a query string. Lists repeat their key (`categories=food&categories=jobs`),
 * which is how FastAPI reads `list[str]` params; `origin` is split into `origin_lat` / `origin_lng`.
 * Unset filters are left out. `false` and "" are left out too unless `explicit` is set: in a
 * search they mean "don't filter", but in overrides they turn off a filter the profile set
 * (`near_transit=false`, `language=`, `categories=`).
 */
export function toSearchParams(query: ResourceQuery, { explicit = false } = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query) as [keyof ResourceQuery, unknown][]) {
    if (value === undefined || value === null) continue;
    if ((value === false || value === "") && !explicit) continue;
    if (key === "origin") {
      const { lat, lng } = value as { lat: number; lng: number };
      params.set("origin_lat", String(lat));
      params.set("origin_lng", String(lng));
    } else if (Array.isArray(value)) {
      // An empty list in overrides is sent as `key=` so the server clears the profile's value.
      if (value.length === 0 && explicit) params.set(key, "");
      value.forEach((v) => params.append(key, String(v)));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Endpoints both staff and clients can call. */
export function createResourcesApi(http: Http) {
  return {
    /** GET /resources: slim summaries for list rows and map pins. */
    search: (query: ResourceQuery = {}): Promise<ResourceSearchResponse> =>
      http.get<ResourceSearchResponse>(`/resources${toSearchParams(query)}`),

    /**
     * GET /resources/{id}: the full resource for the detail drawer. Staff pass `clientId` so the
     * server fills `document_checks` for that client; a logged-in client gets theirs from the token.
     */
    get: (resourceId: string, { clientId }: { clientId?: string } = {}): Promise<ResourceRead> =>
      http.get<ResourceRead>(`/resources/${resourceId}${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ""}`),
  };
}

/**
 * Staff only: filters pre-set from one of my assigned clients' profile (404 if not mine).
 * `overrides` replace the profile's value for each key they set; the rest still come from the profile.
 */
export function createClientResourcesApi(http: Http) {
  return {
    /** GET /clients/{id}/resources */
    matchesFor: (clientId: string, overrides: ResourceQuery = {}): Promise<ClientResourceMatch> =>
      http.get<ClientResourceMatch>(`/clients/${clientId}/resources${toSearchParams(overrides, { explicit: true })}`),
  };
}

/** Logged-in client: the same matching, for themselves. */
export function createMyResourcesApi(http: Http) {
  return {
    /** GET /me/resources */
    mine: (overrides: ResourceQuery = {}): Promise<ClientResourceMatch> =>
      http.get<ClientResourceMatch>(`/me/resources${toSearchParams(overrides, { explicit: true })}`),
  };
}

export type ResourcesApi = ReturnType<typeof createResourcesApi>;
