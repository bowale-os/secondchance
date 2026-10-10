// Web backend (shared computers, kiosks, PWA). One IndexedDB database with three stores.
import type { DocRecord, LocalBackend } from '../LocalBackend';

const DOCS = 'docs';
const BLOBS = 'blobs';
const META = 'meta';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbBackend implements LocalBackend {
  private db: IDBDatabase | null = null;

  constructor(private dbName = 'second-chance-reader', private factory: IDBFactory = indexedDB) {}

  async init() {
    if (this.db) return;
    const open = this.factory.open(this.dbName, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      const docs = db.createObjectStore(DOCS, { keyPath: 'id' });
      docs.createIndex('ownerId', 'ownerId');
      db.createObjectStore(BLOBS);
      db.createObjectStore(META);
    };
    this.db = await request(open);
  }

  private store(name: string, mode: IDBTransactionMode) {
    if (!this.db) throw new Error('IndexedDbBackend.init() was not called');
    return this.db.transaction(name, mode).objectStore(name);
  }

  async putDoc(record: DocRecord) { await request(this.store(DOCS, 'readwrite').put(record)); }

  async getDoc(id: string) {
    return (await request(this.store(DOCS, 'readonly').get(id)) as DocRecord | undefined) ?? null;
  }

  async listDocs(ownerId: string, updatedSince?: string) {
    const all = await request(this.store(DOCS, 'readonly').index('ownerId').getAll(ownerId)) as DocRecord[];
    return updatedSince ? all.filter(r => r.updatedAt > updatedSince) : all;
  }

  async deleteDoc(id: string) { await request(this.store(DOCS, 'readwrite').delete(id)); }

  async putBlob(key: string, data: Uint8Array) { await request(this.store(BLOBS, 'readwrite').put(data, key)); }

  async getBlob(key: string) {
    return (await request(this.store(BLOBS, 'readonly').get(key)) as Uint8Array | undefined) ?? null;
  }

  async deleteBlob(key: string) { await request(this.store(BLOBS, 'readwrite').delete(key)); }

  async deleteBlobsWithPrefix(prefix: string) {
    await request(this.store(BLOBS, 'readwrite').delete(IDBKeyRange.bound(prefix, prefix + '￿')));
  }

  async getMeta(key: string) {
    return (await request(this.store(META, 'readonly').get(key)) as string | undefined) ?? null;
  }

  async setMeta(key: string, value: string) { await request(this.store(META, 'readwrite').put(value, key)); }

  async wipe() {
    for (const name of [DOCS, BLOBS, META]) await request(this.store(name, 'readwrite').clear());
  }
}
