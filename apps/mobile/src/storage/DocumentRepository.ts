// The only storage API screens call. One repository per logged-in profile: it only ever
// reads and writes that profile's documents. Writes always go to the device first, then a
// job is dropped in the sync outbox for the cloud (if and when one is configured).
import type { ActionItem, StoredDocument } from '@scr/shared';
import type { ListQuery } from './StorageProvider';
import type { LocalStorageProvider } from './providers/LocalStorageProvider';
import type { SyncService } from './SyncService';

export type UpcomingItem = ActionItem & { docId: string; docTitle: string };

export class DocumentRepository {
  constructor(
    private local: LocalStorageProvider,
    private sync: SyncService,
    readonly ownerId: string,
  ) {}

  async save(doc: StoredDocument) {
    if (doc.ownerId !== this.ownerId) throw new Error('Document belongs to a different profile');
    const next: StoredDocument = {
      ...doc,
      version: doc.version + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: this.sync.enabled ? 'pending' : 'local_only',
    };
    await this.local.saveDocument(next);          // always local first
    await this.sync.enqueue({ op: 'upsert', docId: next.id });
    return next;
  }

  get(id: string) {
    return this.local.getOwnedDocument(id, this.ownerId);
  }

  list(q: Omit<ListQuery, 'ownerId'> = {}) {
    return this.local.listDocuments({ ...q, ownerId: this.ownerId });
  }

  /** Check off a step, or un-check it (undo). */
  async setActionCompleted(docId: string, actionId: string, completed: boolean) {
    const doc = await this.get(docId);
    if (!doc) return null;
    doc.actions = doc.actions.map(a => a.id !== actionId ? a : {
      ...a, completed, completedAt: completed ? new Date().toISOString() : undefined,
    });
    return this.save(doc);
  }

  /** Every open step across all documents, soonest first; undated steps last. */
  async upcoming(): Promise<UpcomingItem[]> {
    const items = await this.listAll();
    return items
      .flatMap(d => d.actions.map(a => ({ ...a, docId: d.id, docTitle: d.title })))
      .filter(a => !a.completed)
      .sort((x, y) => (x.due.resolvedDate ?? '9999').localeCompare(y.due.resolvedDate ?? '9999')
        || x.order - y.order);
  }

  async remove(id: string) {
    if (!(await this.get(id))) return;
    await this.local.deleteDocument(id);          // soft delete, purged after 30 days
    await this.sync.enqueue({ op: 'delete', docId: id });
  }

  /** "Delete my documents": wipes this profile's data now and queues cloud deletes for later. */
  async deleteEverything() {
    const docs = await this.listAll();
    await this.local.wipeOwner(this.ownerId);
    await this.sync.init();                       // outbox was cleared with the profile's data
    // TODO(cloud): replace per-document deletes with one "hard delete my account data" API call.
    for (const d of docs) await this.sync.enqueue({ op: 'delete', docId: d.id });
  }

  /** Hard-deletes this profile's documents that were removed more than 30 days ago. */
  purgeDeleted() { return this.local.purgeDeleted(this.ownerId); }

  private async listAll() {
    const all: StoredDocument[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.list({ cursor, limit: 200 });
      all.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return all;
  }
}
