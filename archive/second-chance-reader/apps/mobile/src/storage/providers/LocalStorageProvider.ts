// The device is the source of truth. Every document and file is encrypted with the
// device key before it reaches the backend, and search runs here on decrypted data.
import type { BlobRef, StoredDocument } from '@scr/shared';
import type { ListQuery, StorageProvider } from '../StorageProvider';
import { deleteOwnerData, type LocalBackend } from '../LocalBackend';
import { decryptBytes, decryptJson, encryptBytes, encryptJson, sha256Base64 } from '../crypto';
import { BlobNotFoundError } from '../errors';

const DEFAULT_PAGE_SIZE = 50;
const PURGE_AFTER_DAYS = 30;

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';

  constructor(private backend: LocalBackend, private key: Uint8Array) {}

  init() { return this.backend.init(); }
  async isAvailable() { return true; }

  async saveDocument(doc: StoredDocument) {
    await this.backend.putDoc({
      id: doc.id,
      ownerId: doc.ownerId,
      updatedAt: doc.updatedAt,
      deletedAt: doc.deletedAt,
      ciphertext: encryptJson(this.key, doc),
    });
    return doc;
  }

  /** Returns null for missing and soft-deleted documents. */
  async getDocument(id: string) {
    const record = await this.backend.getDoc(id);
    if (!record || record.deletedAt) return null;
    return decryptJson<StoredDocument>(this.key, record.ciphertext);
  }

  /** Like getDocument, but checks ownership before decrypting (another profile's key won't fit). */
  async getOwnedDocument(id: string, ownerId: string) {
    const record = await this.backend.getDoc(id);
    if (!record || record.deletedAt || record.ownerId !== ownerId) return null;
    return decryptJson<StoredDocument>(this.key, record.ciphertext);
  }

  async listDocuments(q: ListQuery) {
    const records = await this.backend.listDocs(q.ownerId, q.updatedSince);
    const needle = q.search?.trim().toLowerCase();
    const matches = records
      .filter(r => !r.deletedAt)
      .map(r => decryptJson<StoredDocument>(this.key, r.ciphertext))
      .filter(d => !q.docType || d.docType === q.docType)
      .filter(d => !needle || [d.title, d.issuer ?? '', d.extractedText, d.simplified.markdown]
        .some(text => text.toLowerCase().includes(needle)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const start = q.cursor ? Number(q.cursor) : 0;
    const end = start + (q.limit ?? DEFAULT_PAGE_SIZE);
    return {
      items: matches.slice(start, end),
      nextCursor: end < matches.length ? String(end) : undefined,
    };
  }

  /**
   * Soft delete by default: the record stays (marked deletedAt) so sync can pass the
   * delete on, and purgeDeleted() removes it for good after 30 days.
   */
  async deleteDocument(id: string, opts?: { hard?: boolean }) {
    const record = await this.backend.getDoc(id);
    if (!record) return;
    const doc = decryptJson<StoredDocument>(this.key, record.ciphertext);

    if (opts?.hard) {
      for (const ref of [...doc.pages, ...(doc.audio ? [doc.audio] : [])]) await this.deleteBlob(ref);
      await this.backend.deleteDoc(id);
      return;
    }
    const now = new Date().toISOString();
    await this.saveDocument({ ...doc, deletedAt: now, updatedAt: now });
  }

  async putBlob(key: string, data: Uint8Array, contentType: string): Promise<BlobRef> {
    await this.backend.putBlob(key, encryptBytes(this.key, data));
    return { key, contentType, size: data.byteLength, checksum: sha256Base64(data), location: 'local' };
  }

  async getBlob(ref: BlobRef) {
    const data = await this.backend.getBlob(ref.key);
    if (!data) throw new BlobNotFoundError(ref.key);
    return decryptBytes(this.key, data);
  }

  async deleteBlob(ref: BlobRef) {
    await this.backend.deleteBlob(ref.key);
  }

  /** Hard-deletes documents that were soft-deleted more than 30 days ago. */
  async purgeDeleted(ownerId: string, now = new Date()) {
    const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 86_400_000).toISOString();
    const records = await this.backend.listDocs(ownerId);
    for (const r of records) {
      if (r.deletedAt && r.deletedAt < cutoff) await this.deleteDocument(r.id, { hard: true });
    }
  }

  /** "Delete my documents": removes one profile's documents, files, and outbox. */
  wipeOwner(ownerId: string) { return deleteOwnerData(this.backend, ownerId); }

  /** Full device reset: every profile's data. */
  wipe() { return this.backend.wipe(); }

  getMeta(key: string) { return this.backend.getMeta(key); }
  setMeta(key: string, value: string) { return this.backend.setMeta(key, value); }
}
