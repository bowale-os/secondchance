import type { ClientCreate, ClientDetail, ClientDraft, ClientRead } from "../types";
import type { Http } from "./http";

export function createClientsApi(http: Http) {
  return {
    /** GET /clients: active clients assigned to the logged-in case worker ([] if none). */
    listMine: (): Promise<ClientRead[]> => http.get<ClientRead[]>("/clients"),

    /** GET /clients/{id}: one of my clients with all profile rows and documents (404 if not mine). */
    get: (clientId: string): Promise<ClientDetail> => http.get<ClientDetail>(`/clients/${clientId}`),

    /**
     * POST /clients/extract: upload documents; Gemini reads them and returns a draft profile.
     * Nothing is created yet. Pass the draft's document ids to `create` once reviewed.
     */
    extractDraft: (files: File[]): Promise<ClientDraft> => {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      return http.post<ClientDraft, FormData>("/clients/extract", form);
    },

    /**
     * POST /clients: create the client (assigned to the logged-in case worker).
     * Rejects with ApiError 409 (phone in use) or 422 (invalid PIN / document ids).
     */
    create: (body: ClientCreate): Promise<ClientRead> => http.post<ClientRead, ClientCreate>("/clients", body),

    /** POST /clients/{id}/confirm-all: verify every unverified profile row of one of my clients. */
    confirmAll: (clientId: string): Promise<{ confirmed: number }> =>
      http.post<{ confirmed: number }>(`/clients/${clientId}/confirm-all`),
  };
}

export type ClientsApi = ReturnType<typeof createClientsApi>;
