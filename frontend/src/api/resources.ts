import type { ClientResourceMatch, Resource, ResourceQuery, ResourceSearchResponse } from "../types";
import type { Http } from "./http";

/** Backend name for the full resource returned by GET /resources/{id}. */
export type ResourceRead = Resource;

/**
 * ResourceQuery as a query string. Lists repeat their key (`categories=food&categories=jobs`),
 * which is how FastAPI reads `list[str]` params; `origin` is split into `origin_lat` / `origin_lng`.
 * Unset and empty filters are left out. `false` is left out too unless `keepFalse` is set:
 * in a search it means "don't filter", but in overrides it turns off a filter the profile set.
 */
export function toSearchParams(query: ResourceQuery, { keepFalse = false } = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query) as [keyof ResourceQuery, unknown][]) {
    if (value === undefined || value === null || value === "") continue;
    if (value === false && !keepFalse) continue;
    if (key === "origin") {
      const { lat, lng } = value as { lat: number; lng: number };
      params.set("origin_lat", String(lat));
      params.set("origin_lng", String(lng));
    } else if (Array.isArray(value)) {
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

    /** GET /resources/{id}: the full resource for the detail drawer. */
    get: (resourceId: string): Promise<ResourceRead> => http.get<ResourceRead>(`/resources/${resourceId}`),
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
      http.get<ClientResourceMatch>(`/clients/${clientId}/resources${toSearchParams(overrides, { keepFalse: true })}`),
  };
}

/** Logged-in client: the same matching, for themselves. */
export function createMyResourcesApi(http: Http) {
  return {
    /** GET /me/resources */
    mine: (overrides: ResourceQuery = {}): Promise<ClientResourceMatch> =>
      http.get<ClientResourceMatch>(`/me/resources${toSearchParams(overrides, { keepFalse: true })}`),
  };
}

export type ResourcesApi = ReturnType<typeof createResourcesApi>;
