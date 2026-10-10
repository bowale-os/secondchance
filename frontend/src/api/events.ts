import type { EventQuery, EventRead, EventWrite, ObligationStatus, StaffEventRead } from "../types";
import type { Http } from "./http";

/** Case worker side: events across my clients. Closing one out is the only change a case worker can make. */
export function createEventsApi(http: Http) {
  return {
    /** GET /obligations: my clients' events, soonest first. */
    list: (query: EventQuery = {}): Promise<StaffEventRead[]> => {
      const params = new URLSearchParams();
      if (query.from) params.set("from", query.from);
      if (query.to) params.set("to", query.to);
      if (query.status) params.set("status", query.status);
      if (query.unseen_only) params.set("unseen_only", "true");
      const qs = params.toString();
      return http.get<StaffEventRead[]>(`/obligations${qs ? `?${qs}` : ""}`);
    },

    /** PATCH /obligations/{id}/status: mark done, or reopen. */
    setStatus: (eventId: string, status: Extract<ObligationStatus, "open" | "done">): Promise<EventRead> =>
      http.patch<EventRead, { status: string }>(`/obligations/${eventId}/status`, { status }),

    /** POST /clients/{id}/obligations/seen: dismiss the notifications for one client. */
    markSeen: (clientId: string): Promise<{ seen: number }> =>
      http.post<{ seen: number }>(`/clients/${clientId}/obligations/seen`),
  };
}

/** Client side: my own calendar. I can change only the events I added. */
export function createClientEventsApi(http: Http) {
  return {
    /** GET /auth/client/obligations: all my events, soonest first. */
    list: (): Promise<EventRead[]> => http.get<EventRead[]>("/auth/client/obligations"),

    /** POST /auth/client/obligations: add an event; my case worker is notified. */
    add: (body: EventWrite): Promise<EventRead> => http.post<EventRead, EventWrite>("/auth/client/obligations", body),

    /** PUT /auth/client/obligations/{id}: change an event I added (404 for any other). */
    edit: (eventId: string, body: EventWrite): Promise<EventRead> =>
      http.put<EventRead, EventWrite>(`/auth/client/obligations/${eventId}`, body),

    /** DELETE /auth/client/obligations/{id}: remove an event I added. */
    remove: (eventId: string): Promise<void> => http.delete(`/auth/client/obligations/${eventId}`),
  };
}
