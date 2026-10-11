/** Calendar events (client obligations). Mirrors EventRead, StaffEventRead and friends in backend/app/schemas.py. */
import type { ObligationStatus, ObligationType } from "./enums";

export interface EventRead {
  id: string;
  client_id: string;
  obligation_type: ObligationType;
  description: string | null;
  amount: string | null;
  due_date: string | null; // "YYYY-MM-DD"
  due_time: string | null; // "HH:MM:SS"
  location: string | null;
  /** OVERDUE is worked out by the backend from the date. */
  status: ObligationStatus;
  added_by_client: boolean;
  staff_seen_at: string | null;
  created_at: string;
}

/** An event in a case worker's calendar, with the client's name. */
export interface StaffEventRead extends EventRead {
  client_name: string;
}

/** What a client sends to add or change one of their own events. */
export interface EventWrite {
  description: string;
  due_date: string;
  obligation_type?: ObligationType;
  due_time?: string | null;
  location?: string | null;
  amount?: string | null;
}

export interface EventQuery {
  from?: string;
  to?: string;
  status?: ObligationStatus;
  /** Client-added events the case worker has not acknowledged yet, whatever their date. */
  unseen_only?: boolean;
}

/** GET /auth/client/case-worker */
export interface CaseWorkerRead {
  full_name: string;
  phone: string | null;
  email: string;
  organization_name: string | null;
}
