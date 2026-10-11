import { useAuth0 } from "@auth0/auth0-react";
import { useMemo } from "react";
import { createAppointmentsApi } from "./appointments";
import { createAuthApi } from "./auth";
import { createClientAuthApi } from "./clientAuth";
import { createClientsApi } from "./clients";
import { createDocumentsApi } from "./documents";
import { createClientEventsApi, createEventsApi } from "./events";
import { createHttp, type GetToken } from "./http";
import { createReaderApi } from "./reader";
import { createClientResourcesApi, createMyResourcesApi, createResourcesApi } from "./resources";
import { createTextingApi } from "./texting";

export { ApiError } from "./http";

/** Builds every grouped endpoint module from one token source. Add new groups here. */
export function createApi(getToken: GetToken) {
  const http = createHttp(getToken);
  return {
    auth: createAuthApi(http),
    clients: createClientsApi(http),
    documents: createDocumentsApi(http),
    events: createEventsApi(http),
    resources: { ...createResourcesApi(http), ...createClientResourcesApi(http) },
    texting: createTextingApi(http),
    appointments: createAppointmentsApi(http),
    reader: createReaderApi(http, getToken),
  };
}

export type Api = ReturnType<typeof createApi>;

/** Endpoints for a logged-in client (token from POST /auth/client/login) and the public login call. */
export function createClientApi(getToken: GetToken) {
  const http = createHttp(getToken);
  return {
    auth: createClientAuthApi(http),
    documents: createDocumentsApi(http),
    events: createClientEventsApi(http),
    resources: { ...createResourcesApi(http), ...createMyResourcesApi(http) },
    reader: createReaderApi(http, getToken),
  };
}

export type ClientApi = ReturnType<typeof createClientApi>;

/** React hook: `const api = useApi(); await api.clients.listMine();` */
export function useApi(): Api {
  const { getAccessTokenSilently } = useAuth0();
  return useMemo(
    () =>
      createApi(async () => {
        const token = await getAccessTokenSilently();
        if (!token) throw new Error("Not authenticated");
        return token;
      }),
    [getAccessTokenSilently]
  );
}
