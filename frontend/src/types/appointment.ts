/** Mirrors backend schemas AppointmentRead / AppointmentWrite / ScheduleItemRead. */

export interface AppointmentRead {
  id: string;
  client_id: string;
  title: string;
  starts_at: string; // ISO, UTC
  ends_at: string | null;
  location_name: string | null;
  address: string | null;
  transit_note: string | null;
  documents_to_bring: string[] | null;
  obligation_id: string | null;
  cancelled: boolean;
  created_by_staff_id: string | null;
  created_at: string;
}

/** Times without an offset ("2026-10-12T14:00:00") are read as America/New_York. */
export interface AppointmentWrite {
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location_name?: string | null;
  address?: string | null;
  transit_note?: string | null;
  documents_to_bring?: string[];
  obligation_id?: string | null;
}

export type ScheduleRange = "day" | "tomorrow" | "week";

export interface SchedulePreviewText {
  range: ScheduleRange;
  text: string;
}
