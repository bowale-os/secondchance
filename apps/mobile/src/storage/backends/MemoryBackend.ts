import type { DocRecord, LocalBackend } from '../LocalBackend';

/** In-memory backend for tests. Exposes its maps so tests can inspect what was written. */
export class MemoryBackend implements LocalBackend {
  readonly docs = new Map<string, DocRecord>();
  readonly blobs = new Map<string, Uint8Array>();
  readonly meta = new Map<string, string>();

  async init() {}

  async putDoc(record: DocRecord) { this.docs.set(record.id, { ...record }); }
  async getDoc(id: string) { return this.docs.get(id) ?? null; }
  async listDocs(ownerId: string, updatedSince?: string) {
    return [...this.docs.values()].filter(r =>
      r.ownerId === ownerId && (!updatedSince || r.updatedAt > updatedSince));
  }
  async deleteDoc(id: string) { this.docs.delete(id); }

  async putBlob(key: string, data: Uint8Array) { this.blobs.set(key, data); }
  async getBlob(key: string) { return this.blobs.get(key) ?? null; }
  async deleteBlob(key: string) { this.blobs.delete(key); }
  async deleteBlobsWithPrefix(prefix: string) {
    for (const key of [...this.blobs.keys()]) if (key.startsWith(prefix)) this.blobs.delete(key);
  }

  async getMeta(key: string) { return this.meta.get(key) ?? null; }
  async setMeta(key: string, value: string) { this.meta.set(key, value); }

  async wipe() {
    this.docs.clear();
    this.blobs.clear();
    this.meta.clear();
  }
}
