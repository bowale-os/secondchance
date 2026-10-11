// Drains the outbox to the cloud when one is configured and the device is online.
// With no cloud (STORAGE_MODE=local) jobs simply wait in the outbox; nothing breaks.
import type { StorageProvider } from './StorageProvider';
import { SyncConflictError } from './errors';

export type OutboxJob = { op: 'upsert' | 'delete'; docId: string; attempts?: number };

/** Where the outbox survives app restarts (SQLite / IndexedDB meta table in the real build). */
export interface OutboxStore {
  load(): Promise<OutboxJob[]>;
  save(jobs: OutboxJob[]): Promise<void>;
}

export const AUTO_FLUSH_MS = 5 * 60 * 1000;

export class SyncService {
  private outbox: OutboxJob[] = [];
  private flushing: Promise<void> | null = null;

  constructor(
    private local: StorageProvider,
    private remote: StorageProvider | null,
    private store?: OutboxStore,
  ) {}

  get enabled() { return this.remote !== null; }
  get pending(): readonly OutboxJob[] { return this.outbox; }

  async init() {
    if (this.store) this.outbox = await this.store.load();
  }

  /** Adds a job, replacing any earlier job for the same document (only the latest state matters). */
  async enqueue(job: OutboxJob) {
    this.outbox = [...this.outbox.filter(j => j.docId !== job.docId), job];
    await this.store?.save(this.outbox);
    void this.flush();
  }

  /** Safe to call any time (app start, network regained, timer); concurrent calls share one run. */
  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  /** Flushes every 5 minutes. Returns a function that stops the timer. */
  startAutoFlush(intervalMs = AUTO_FLUSH_MS) {
    const timer = setInterval(() => void this.flush(), intervalMs);
    return () => clearInterval(timer);
  }

  private async drain() {
    if (!this.remote || !(await this.remote.isAvailable())) return;   // no cloud yet: wait
    while (this.outbox.length) {
      const job = this.outbox[0];
      try {
        if (job.op === 'delete') {
          await this.remote.deleteDocument(job.docId);
        } else {
          const doc = await this.local.getDocument(job.docId);
          if (doc) {
            // TODO(cloud): upload any BlobRef with location 'local' via remote.putBlob first,
            // then store the returned remote key alongside the local one.
            const synced = { ...doc, syncStatus: 'synced' as const };
            await this.remote.saveDocument(synced);
            // Only mark it synced if the user didn't change it while it was uploading.
            const current = await this.local.getDocument(job.docId);
            if (current?.version === doc.version) await this.local.saveDocument(synced);
          }
        }
        this.outbox.shift();
      } catch (e) {
        if (e instanceof SyncConflictError) {
          // TODO(cloud): fetch the cloud copy, keep the newest, and tell the user.
          const doc = await this.local.getDocument(job.docId);
          if (doc) await this.local.saveDocument({ ...doc, syncStatus: 'conflict' });
          this.outbox.shift();
          continue;
        }
        job.attempts = (job.attempts ?? 0) + 1;
        break;   // retry on next flush (app start, network regained, every 5 min)
      } finally {
        await this.store?.save(this.outbox);
      }
    }
  }
}

/** Persists one profile's outbox in the local backend's meta table. */
export function metaOutboxStore(meta: {
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}, ownerId: string): OutboxStore {
  const KEY = `sync.outbox.${ownerId}`;   // must match deleteOwnerData in LocalBackend.ts
  return {
    async load() {
      const raw = await meta.getMeta(KEY);
      return raw ? JSON.parse(raw) as OutboxJob[] : [];
    },
    save: jobs => meta.setMeta(KEY, JSON.stringify(jobs)),
  };
}
