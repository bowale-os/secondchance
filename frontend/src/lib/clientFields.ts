/** Which client fields the review form shows, and how each one is rendered. */

import { ContactMethod, EmploymentStatus, HousingStatus } from "../types";

export type ClientFormKey =
  | "first_name"
  | "last_name"
  | "preferred_name"
  | "phone"
  | "language"
  | "state"
  | "release_date"
  | "date_of_birth"
  | "email"
  | "preferred_contact_method"
  | "address_line"
  | "city"
  | "zip_code"
  | "housing_status"
  | "employment_status"
  | "monthly_income"
  | "has_transportation"
  | "emergency_contact_name"
  | "emergency_contact_phone"
  | "notes";

/** Every form value is a string; empty means "not provided". */
export type ClientFormState = Record<ClientFormKey, string>;

export type FieldKind = "text" | "tel" | "email" | "date" | "number" | "select" | "textarea";

export interface FieldConfig {
  key: ClientFormKey;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** Select options as [value, label]; a blank "Not provided" option is always added. */
  options?: readonly (readonly [value: string, label: string])[];
  /** Spans the full width of the form grid. */
  wide?: boolean;
}

const options = (values: Record<string, string>) =>
  Object.values(values).map((v) => [v, v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())] as const);

export const CLIENT_FIELD_SECTIONS: { title: string; fields: FieldConfig[] }[] = [
  {
    title: "Basics",
    fields: [
      { key: "first_name", label: "First name", kind: "text", required: true },
      { key: "last_name", label: "Last name", kind: "text", required: true },
      { key: "preferred_name", label: "Preferred name", kind: "text" },
      { key: "date_of_birth", label: "Date of birth", kind: "date" },
      { key: "phone", label: "Phone", kind: "tel" },
      { key: "email", label: "Email", kind: "email" },
      { key: "language", label: "Language", kind: "text" },
      { key: "state", label: "State", kind: "text" },
      { key: "release_date", label: "Release date", kind: "date" },
      { key: "preferred_contact_method", label: "Preferred contact", kind: "select", options: options(ContactMethod) },
    ],
  },
  {
    title: "Home and work",
    fields: [
      { key: "address_line", label: "Address", kind: "text", wide: true },
      { key: "city", label: "City", kind: "text" },
      { key: "zip_code", label: "ZIP code", kind: "text" },
      { key: "housing_status", label: "Housing", kind: "select", options: options(HousingStatus) },
      { key: "employment_status", label: "Employment", kind: "select", options: options(EmploymentStatus) },
      { key: "monthly_income", label: "Monthly income ($)", kind: "number" },
      {
        key: "has_transportation",
        label: "Has transportation",
        kind: "select",
        options: [
          ["yes", "Yes"],
          ["no", "No"],
        ],
      },
    ],
  },
  {
    title: "Emergency contact and notes",
    fields: [
      { key: "emergency_contact_name", label: "Contact name", kind: "text" },
      { key: "emergency_contact_phone", label: "Contact phone", kind: "tel" },
      { key: "notes", label: "Notes", kind: "textarea", wide: true },
    ],
  },
];
