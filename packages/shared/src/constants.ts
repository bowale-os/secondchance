import type { DocType } from './types';

/** Items due within this many days are pinned to the top as urgent. */
export const URGENT_WINDOW_DAYS = 7;

/** Document types where any action counts as urgent: missing one can mean a violation. */
export const LEGAL_DOC_TYPES: readonly DocType[] = ['parole_conditions', 'probation', 'court_order'];

/** Below this per-page confidence the app asks the user to retake the page. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_PAGES = 30;
export const ACCEPTED_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  parole_conditions: 'Parole',
  probation: 'Probation',
  court_order: 'Court',
  benefits: 'Benefits',
  housing: 'Housing',
  employment: 'Job',
  medical: 'Medical',
  id: 'ID',
  child_support: 'Child support',
  other: 'Other',
};

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
] as const;

export const DISCLAIMER =
  "This is a helper, not legal advice. Check the original paper and ask your case manager or legal aid if anything is unclear.";
