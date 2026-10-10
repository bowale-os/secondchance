/** Builders that turn form state into request bodies matching the backend schema. */

import type { ClientCreate } from "./client";
import type { StaffSignup } from "./staff";

export const blankToNull = (v: string | null | undefined): string | null =>
  v === "" || v === undefined || v === null ? null : v;

export interface StaffSignupForm {
  email: string;
  full_name: string;
  organization_name?: string;
  phone?: string;
}

export function toStaffSignup(f: StaffSignupForm): StaffSignup {
  return {
    email: f.email,
    full_name: f.full_name.trim(),
    organization_name: blankToNull(f.organization_name),
    phone: blankToNull(f.phone),
  };
}

export interface ClientCreateForm {
  first_name: string;
  last_name: string;
  pin: string;
  preferred_name?: string;
  phone?: string;
  language?: string;
  state?: string;
  release_date?: string;
}

export function toClientCreate(f: ClientCreateForm): ClientCreate {
  return {
    first_name: f.first_name.trim(),
    last_name: f.last_name.trim(),
    pin: f.pin,
    preferred_name: blankToNull(f.preferred_name),
    phone: blankToNull(f.phone),
    language: f.language || "en",
    state: f.state || "GA",
    release_date: blankToNull(f.release_date),
  };
}
