/**
 * Frontend mirror of backend/app/schemas.py and the enums in backend/app/tables.py.
 * The definitions live in ./types, split by concern; this file keeps the old import path working.
 *
 * Keep ./types in sync with the backend. UUIDs are strings, dates are "YYYY-MM-DD",
 * datetimes are ISO-8601 strings, decimals are strings. Optional[...] in Python is `T | null`.
 */
export * from "./types";
