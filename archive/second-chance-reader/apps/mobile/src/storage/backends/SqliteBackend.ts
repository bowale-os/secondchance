// Android / iOS backend: document records in SQLite, files (page images, audio) on disk.
// Both hold ciphertext only; encryption happens in LocalStorageProvider.
import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import type { DocRecord, LocalBackend } from '../LocalBackend';

interface DocRow {
  id: string;
  owner_id: string;
  updated_at: string;
  deleted_at: string | null;
  ciphertext: string;
}

const toRecord = (r: DocRow): DocRecord => ({
  id: r.id,
  ownerId: r.owner_id,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? undefined,
  ciphertext: r.ciphertext,
});

export class SqliteBackend implements LocalBackend {
  private db: SQLite.SQLiteDatabase | null = null;
  private blobDir: Directory;

  constructor(private dbName = 'second-chance-reader.db') {
    this.blobDir = new Directory(Paths.document, 'blobs');
  }

  private get conn() {
    if (!this.db) throw new Error('SqliteBackend.init() was not called');
    return this.db;
  }

  // Keys look like "docs/{docId}/page-1.jpg"; flatten them into one safe file name.
  private file(key: string) {
    return new File(this.blobDir, encodeURIComponent(key));
  }

  async init() {
    if (this.db) return;
    this.db = await SQLite.openDatabaseAsync(this.dbName);
    await this.db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS docs (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        ciphertext TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS docs_owner_updated ON docs (owner_id, updated_at);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    `);
    if (!this.blobDir.exists) this.blobDir.create({ intermediates: true });
  }

  async putDoc(r: DocRecord) {
    await this.conn.runAsync(
      `INSERT OR REPLACE INTO docs (id, owner_id, updated_at, deleted_at, ciphertext) VALUES (?, ?, ?, ?, ?)`,
      r.id, r.ownerId, r.updatedAt, r.deletedAt ?? null, r.ciphertext,
    );
  }

  async getDoc(id: string) {
    const row = await this.conn.getFirstAsync<DocRow>('SELECT * FROM docs WHERE id = ?', id);
    return row ? toRecord(row) : null;
  }

  async listDocs(ownerId: string, updatedSince = '') {
    const rows = await this.conn.getAllAsync<DocRow>(
      'SELECT * FROM docs WHERE owner_id = ? AND updated_at > ?', ownerId, updatedSince);
    return rows.map(toRecord);
  }

  async deleteDoc(id: string) {
    await this.conn.runAsync('DELETE FROM docs WHERE id = ?', id);
  }

  async putBlob(key: string, data: Uint8Array) {
    const f = this.file(key);
    if (!f.exists) f.create();
    f.write(data);
  }

  async getBlob(key: string) {
    const f = this.file(key);
    return f.exists ? await f.bytes() : null;
  }

  async deleteBlob(key: string) {
    const f = this.file(key);
    if (f.exists) f.delete();
  }

  async deleteBlobsWithPrefix(prefix: string) {
    if (!this.blobDir.exists) return;
    for (const entry of this.blobDir.list()) {
      if (entry instanceof File && decodeURIComponent(entry.name).startsWith(prefix)) entry.delete();
    }
  }

  async getMeta(key: string) {
    const row = await this.conn.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string) {
    await this.conn.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
  }

  async wipe() {
    await this.conn.execAsync('DELETE FROM docs; DELETE FROM meta;');
    if (this.blobDir.exists) this.blobDir.delete();
    this.blobDir.create({ intermediates: true });
  }
}
