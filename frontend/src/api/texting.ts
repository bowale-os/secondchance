import type { TextingEnroll, TextingStatus } from "../types";
import type { Http } from "./http";

/** Case-worker controls for a client's text-bot enrollment. All 404 if the client isn't mine. */
export function createTextingApi(http: Http) {
  return {
    /** GET /clients/{id}/texting */
    status: (clientId: string): Promise<TextingStatus> =>
      http.get<TextingStatus>(`/clients/${clientId}/texting`),

    /**
     * PUT /clients/{id}/texting: turn texting on or change the number; sends a welcome
     * text with no personal details. Rejects with 422 (bad number / no consent) or
     * 409 (number enrolled for another client).
     */
    enroll: (clientId: string, body: TextingEnroll): Promise<TextingStatus> =>
      http.put<TextingStatus, TextingEnroll>(`/clients/${clientId}/texting`, body),

    /** POST /clients/{id}/texting/unlock: clear a lock after too many wrong sign-ins. */
    unlock: (clientId: string): Promise<TextingStatus> =>
      http.post<TextingStatus>(`/clients/${clientId}/texting/unlock`),

    /** DELETE /clients/{id}/texting: turn texting off. */
    turnOff: (clientId: string): Promise<TextingStatus> =>
      http.delete<TextingStatus>(`/clients/${clientId}/texting`),
  };
}

export type TextingApi = ReturnType<typeof createTextingApi>;
