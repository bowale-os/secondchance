import type { CaseWorkerRead, ClientLogin, ClientRead, ClientToken, DocumentListItem } from "../types";
import type { Http } from "./http";

export function createClientAuthApi(http: Http) {
  return {
    /**
     * POST /auth/client/login (no token needed). Rejects with ApiError 401 (wrong name or PIN)
     * or 429 (too many attempts; temporarily locked).
     */
    login: (body: ClientLogin): Promise<ClientToken> => http.post<ClientToken, ClientLogin>("/auth/client/login", body),

    /** GET /auth/client/me: the logged-in client's own profile. */
    me: (): Promise<ClientRead> => http.get<ClientRead>("/auth/client/me"),

    /** GET /auth/client/documents: the client's own documents, newest first. Open one with `documents.open`. */
    /** GET /auth/client/case-worker: who to call (404 if none is assigned). */
    caseWorker: (): Promise<CaseWorkerRead> => http.get<CaseWorkerRead>("/auth/client/case-worker"),

    documents: (): Promise<DocumentListItem[]> => http.get<DocumentListItem[]>("/auth/client/documents"),
  };
}

export type ClientAuthApi = ReturnType<typeof createClientAuthApi>;
