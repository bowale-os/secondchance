// The one interface every storage provider implements. App code never talks to a
// provider directly; it goes through DocumentRepository.
import type { StoredDocument, BlobRef, DocType } from '@scr/shared';

export interface ListQuery {
  ownerId: string;
  docType?: DocType;
  search?: string;
  updatedSince?: string;   // used by sync
  limit?: number;
  cursor?: string;
}

export interface StorageProvider {
  readonly name: string;
  init(): Promise<void>;
  isAvailable(): Promise<boolean>;        // e.g. online + authenticated

  // Documents (JSON metadata + results)
  saveDocument(doc: StoredDocument): Promise<StoredDocument>;
  getDocument(id: string): Promise<StoredDocument | null>;
  listDocuments(q: ListQuery): Promise<{ items: StoredDocument[]; nextCursor?: string }>;
  deleteDocument(id: string, opts?: { hard?: boolean }): Promise<void>;

  // Binary files (page images, PDFs, audio)
  putBlob(key: string, data: Uint8Array, contentType: string): Promise<BlobRef>;
  getBlob(ref: BlobRef): Promise<Uint8Array>;
  deleteBlob(ref: BlobRef): Promise<void>;
}
