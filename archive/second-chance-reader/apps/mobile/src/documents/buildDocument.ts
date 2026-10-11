// Collects streamed results into a StoredDocument and saves it, with its page images
// encrypted on the device. Auto-saved by default, as the plan says.
import { bytesToHex, randomBytes } from '@noble/ciphers/utils.js';
import type {
  ActionItem, DocumentMeta, ExtractedPage, Flag, ProgressEvent, SimplifiedDocument, StoredDocument,
} from '@scr/shared';
import type { Storage } from '../storage/createStorage';
import { blobKey } from '../storage/LocalBackend';
import { fromBase64 } from '../storage/crypto';
import type { UploadPage } from '../api/processStream';

/** Accumulates events from the stream; `complete` once everything needed has arrived. */
export class ResultCollector {
  pages: ExtractedPage[] = [];
  text = '';
  meta: DocumentMeta | null = null;
  simplified: SimplifiedDocument | null = null;
  actions: ActionItem[] | null = null;
  flags: Flag[] = [];
  retakePages: number[] = [];

  add(e: ProgressEvent) {
    switch (e.stage) {
      case 'extracted': this.pages = e.pages; this.text = e.text; break;
      case 'retake_suggested': this.retakePages = e.pages; break;
      case 'classified': this.meta = e.meta; break;
      case 'simplified': this.simplified = e.simplified; break;
      case 'actions': this.actions = e.actions; this.flags = e.flags; break;
    }
  }

  get complete() {
    return !!(this.meta && this.simplified && this.actions);
  }
}

export const newId = () => bytesToHex(randomBytes(16));

const extension = (mime: string) =>
  ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' } as Record<string, string>)[mime] ?? 'bin';

export async function saveProcessedDocument(
  storage: Storage,
  ownerId: string,
  result: ResultCollector,
  uploads: UploadPage[],
  language: string,
): Promise<StoredDocument> {
  if (!result.complete) throw new Error('Results are not complete');
  const id = newId();

  const pages = [];
  for (const [i, u] of uploads.entries()) {
    const key = blobKey(ownerId, id, `page-${i + 1}.${extension(u.mimeType)}`);
    pages.push(await storage.local.putBlob(key, fromBase64(u.dataBase64), u.mimeType));
  }

  const now = new Date().toISOString();
  const doc: StoredDocument = {
    id,
    ownerId,
    title: result.meta!.title,
    docType: result.meta!.docType,
    issuer: result.meta!.issuer,
    documentDate: result.meta!.documentDate,
    language,
    pages,
    extractedText: result.text,
    simplified: result.simplified!,
    actions: result.actions!,
    flags: result.flags,
    sharedWith: [],
    createdAt: now,
    updatedAt: now,
    version: 0,
    syncStatus: 'local_only',
  };
  return storage.documents.save(doc);
}
