// Shapes shared by the app, the API, and every storage provider.

export type SyncStatus = 'local_only' | 'pending' | 'synced' | 'conflict' | 'error';

export interface BlobRef {
  key: string;              // e.g. "users/{userId}/docs/{docId}/page-1.jpg"
  contentType: string;      // image/jpeg, application/pdf, audio/mpeg
  size: number;
  checksum: string;         // sha256, used for de-dupe and sync checks
  location: 'local' | 'remote' | 'both';
}

export interface DueDate {
  type: 'exact' | 'relative' | 'none';
  text?: string;
  anchor?: 'document_date' | 'release_date' | 'received_date';
  offsetHours?: number;
  resolvedDate?: string | null;   // ISO date set by the date normalizer, never by the model
  explanation?: string;           // "72 hours after your release on Oct 9 = Oct 12"
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
  priority: 'urgent' | 'normal' | 'low';
  consequence?: string;
  sourceQuote: string;
  sourcePage: number;
  confidence: number;
  completed: boolean;
  completedAt?: string;
  reminderAt?: string;
}

export interface GlossaryEntry { term: string; meaning: string }

export interface SimplifiedDocument {
  markdown: string;
  glossary: GlossaryEntry[];
}

export type FlagKind = 'unverified_value' | 'low_confidence_page';
export interface Flag { kind: FlagKind; detail: string; actionId?: string }

export interface StoredDocument {
  id: string;
  ownerId: string;            // resident profile id
  institutionId?: string;     // halfway house / program, for multi-tenant cloud
  title: string;
  docType: DocType;
  issuer?: string;
  documentDate?: string;
  language: string;           // output language, e.g. "en", "es"
  pages: BlobRef[];           // original images / PDF
  extractedText: string;
  simplified: SimplifiedDocument;
  actions: ActionItem[];
  audio?: BlobRef;            // cached TTS of simplified text
  flags: Flag[];
  sharedWith: { staffId: string; scope: 'actions_only'; grantedAt: string }[];
  createdAt: string;
  updatedAt: string;
  version: number;            // bumped on every write, used for sync conflicts
  syncStatus: SyncStatus;
  deletedAt?: string;         // soft delete, then purged
}

export type DocType =
  | 'parole_conditions'
  | 'probation'
  | 'court_order'
  | 'benefits'
  | 'housing'
  | 'employment'
  | 'medical'
  | 'id'
  | 'child_support'
  | 'other';

export interface DocumentMeta {
  docType: DocType;
  title: string;
  issuer?: string;
  documentDate?: string;      // ISO date, only when printed on the paper
}

export interface ExtractedPage { n: number; text: string; confidence: number }

/** Events streamed from POST /process so the Processing screen can show results as they finish. */
export type ProgressEvent =
  | { stage: 'reading' }
  | { stage: 'extracted'; pages: ExtractedPage[]; text: string }
  | { stage: 'retake_suggested'; pages: number[] }
  | { stage: 'classified'; meta: DocumentMeta }
  | { stage: 'simplifying' }
  | { stage: 'simplified'; simplified: SimplifiedDocument }
  | { stage: 'finding_actions' }
  | { stage: 'actions'; actions: ActionItem[]; flags: Flag[] }
  | { stage: 'done' }
  | { stage: 'error'; message: string };

export type ProgressStage = ProgressEvent['stage'];
