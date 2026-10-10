import { useAuth0 } from "@auth0/auth0-react";
import { useMemo } from "react";
import { createAuthApi } from "./auth";
import { createClientsApi } from "./clients";
import { createDocumentsApi } from "./documents";
import { createHttp, type GetToken } from "./http";

export { ApiError } from "./http";

/** Builds every grouped endpoint module from one token source. Add new groups here. */
export function createApi(getToken: GetToken) {
  const http = createHttp(getToken);
  return {
    auth: createAuthApi(http),
    clients: createClientsApi(http),
    documents: createDocumentsApi(http),
  };
}

export type Api = ReturnType<typeof createApi>;

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
