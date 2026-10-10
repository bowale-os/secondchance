import type { AppointmentRead, AppointmentWrite, SchedulePreviewText, ScheduleRange } from "../types";
import type { Http } from "./http";

/** Case-worker appointment CRUD. Every call 404s if the client isn't assigned to me. */
export function createAppointmentsApi(http: Http) {
  const base = (clientId: string) => `/clients/${clientId}/appointments`;
  return {
    /** Upcoming (and, with includePast, the last 30 days), cancelled ones included. */
    list: (clientId: string, includePast = false): Promise<AppointmentRead[]> =>
      http.get<AppointmentRead[]>(`${base(clientId)}${includePast ? "?include_past=true" : ""}`),

    create: (clientId: string, body: AppointmentWrite): Promise<AppointmentRead> =>
      http.post<AppointmentRead, AppointmentWrite>(base(clientId), body),

    /** Full replace; also un-cancels. */
    replace: (clientId: string, id: string, body: AppointmentWrite): Promise<AppointmentRead> =>
      http.put<AppointmentRead, AppointmentWrite>(`${base(clientId)}/${id}`, body),

    /** Cancel: kept for the record, hidden from the client's schedule. */
    cancel: (clientId: string, id: string): Promise<AppointmentRead> =>
      http.delete<AppointmentRead>(`${base(clientId)}/${id}`),

    /** The exact text the client gets for TODAY / TOMORROW / WEEK. */
    previewText: (clientId: string, range: ScheduleRange): Promise<SchedulePreviewText> =>
      http.get<SchedulePreviewText>(`/clients/${clientId}/schedule/text?range=${range}`),
  };
}

export type AppointmentsApi = ReturnType<typeof createAppointmentsApi>;
