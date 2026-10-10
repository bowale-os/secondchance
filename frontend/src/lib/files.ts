/** Client-side checks for document uploads. Limits match backend/app/extraction.py. */

const ACCEPTED_TYPES: readonly string[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
];

/** Value for <input type="file" accept>. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(",");
export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface AddFilesResult {
  files: File[];
  errors: string[];
}

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/** Adds valid files to the current selection; returns the new list and why any were skipped. */
export function addFiles(current: File[], incoming: File[]): AddFilesResult {
  const files = [...current];
  const errors: string[] = [];

  for (const file of incoming) {
    if (files.some((f) => sameFile(f, file))) continue;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      errors.push(`${file.name}: use a PDF, PNG, JPEG, WebP or HEIC file`);
    } else if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}: must be between 1 byte and ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    } else if (files.length >= MAX_FILES) {
      errors.push(`You can upload up to ${MAX_FILES} files at a time`);
    } else {
      files.push(file);
    }
  }
  return { files, errors: [...new Set(errors)] };
}
