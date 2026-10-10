/** Case worker shapes (backend: StaffSignup, StaffRead) and the health check. */

import type { StaffRole } from "./enums";

export interface HealthRead {
  status: string;
  database: boolean;
}

/** Body of POST /auth/signup (auth0_id comes from the verified token). */
export interface StaffSignup {
  email: string;
  full_name: string;
  organization_name?: string | null;
  phone?: string | null;
}

export interface StaffRead {
  id: string;
  auth0_id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  organization_name: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
