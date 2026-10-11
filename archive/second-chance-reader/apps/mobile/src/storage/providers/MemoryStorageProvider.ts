// Plain in-memory provider for tests, e.g. standing in for the cloud in SyncService tests.
import type { BlobRef, StoredDocument } from '@scr/shared';
import type { ListQuery, StorageProvider } from '../StorageProvider';
import { BlobNotFoundError } from '../errors';
import { sha256Base64 } from '../crypto';

export class MemoryStorageProvider implements StorageProvider {
  readonly docs = new Map<string, StoredDocument>();
  readonly blobs = new Map<string, Uint8Array>();
  /** Flip to false to simulate being offline. */
  available = true;

  constructor(readonly name = 'memory') {}

  async init() {}
  async isAvailable() { return this.available; }

  async saveDocument(doc: StoredDocument) {
    this.docs.set(doc.id, structuredClone(doc));
    return doc;
  }

  async getDocument(id: string) {
    const doc = this.docs.get(id);
    return doc && !doc.deletedAt ? structuredClone(doc) : null;
  }

  async listDocuments(q: ListQuery) {
    const items = [...this.docs.values()].filter(d =>
      d.ownerId === q.ownerId && !d.deletedAt
      && (!q.updatedSince || d.updatedAt > q.updatedSince)
      && (!q.docType || d.docType === q.docType));
    return { items: items.map(d => structuredClone(d)) };
  }

  async deleteDocument(id: string, opts?: { hard?: boolean }) {
    const doc = this.docs.get(id);
    if (!doc) return;
    if (opts?.hard) this.docs.delete(id);
    else doc.deletedAt = new Date().toISOString();
  }

  async putBlob(key: string, data: Uint8Array, contentType: string): Promise<BlobRef> {
    this.blobs.set(key, data);
    return { key, contentType, size: data.byteLength, checksum: sha256Base64(data), location: 'local' };
  }

  async getBlob(ref: BlobRef) {
    const data = this.blobs.get(ref.key);
    if (!data) throw new BlobNotFoundError(ref.key);
    return data;
  }

  async deleteBlob(ref: BlobRef) { this.blobs.delete(ref.key); }
}
