/** Document reader shapes. Mirror backend/app/reader/schemas.py (camelCase on the wire). */

export type DocType =
  | "parole_conditions" | "probation" | "court_order" | "benefits" | "housing"
  | "employment" | "medical" | "id" | "child_support" | "other";

export type Priority = "urgent" | "normal" | "low";

export interface DueDate {
  type: "exact" | "relative" | "none";
  text?: string;
  anchor?: "document_date" | "release_date" | "received_date";
  offsetHours?: number;
  offsetDays?: number;
  businessDays?: boolean;
  /** Worked out on the server, never by the AI. */
  resolvedDate?: string;
  /** "72 hours after your release on Oct 9 = Oct 12" */
  explanation?: string;
}

export interface ActionItem {
  id: string;
  order: number;
  title: string;
  details: string;
  due: DueDate;
  location?: string;
  contact?: { name?: string; phone?: string; email?: string };
  bring?: string[];
  priority: Priority;
  consequence?: string;
  sourceQuote: string;
  sourcePage: number;
  confidence: number;
  completed: boolean;
  completedAt?: string;
  /** A case worker added it to the schedule. */
  checkedByCaseWorker: boolean;
}

export interface Flag {
  kind: "unverified_value" | "unverified_source" | "low_confidence_page";
  detail: string;
  value?: string;
  actionId?: string;
  page?: number;
}

export interface GlossaryEntry { term: string; meaning: string }
export interface SimplifiedDocument { markdown: string; glossary: GlossaryEntry[] }

export interface DocumentMeta {
  docType: DocType;
  title: string;
  issuer?: string;
  documentDate?: string;
}

export interface ExtractedPage { n: number; text: string; confidence: number }

/** One line of the POST /reader/process stream. */
export type ProgressEvent =
  | { stage: "reading" }
  | { stage: "extracted"; pages: ExtractedPage[]; text: string }
  | { stage: "retake_suggested"; pages: number[] }
  | { stage: "classified"; meta: DocumentMeta }
  | { stage: "simplifying" }
  | { stage: "simplified"; simplified: SimplifiedDocument }
  | { stage: "finding_actions" }
  | { stage: "actions"; actions: ActionItem[]; flags: Flag[] }
  | { stage: "done"; receipt?: string }
  | { stage: "error"; message: string };

/** A finished reading, kept or not. */
export interface ReadingResult {
  meta: DocumentMeta;
  simplified: SimplifiedDocument;
  actions: ActionItem[];
  flags: Flag[];
}

/** GET /papers/{readingId} */
export interface ReadingView extends ReadingResult {
  id: string;
  documentId: string;
  language: string;
}

export interface PaperListItem {
  readingId: string;
  documentId: string;
  title: string;
  docType: DocType;
  issuer?: string;
  documentDate?: string;
  keptAt: string;
  keptByCaseWorker: boolean;
  openCount: number;
  nextDue?: string;
}

export interface UpcomingItem {
  readingId: string;
  paperTitle: string;
  docType: DocType;
  action: ActionItem;
  flags: Flag[];
}

export interface KeepResult { documentId: string; readingId: string }
