import { describe, expect, it } from 'vitest';
import { createStorage } from '../createStorage';
import { MemoryBackend } from '../backends/MemoryBackend';
import { KEY, makeAction, makeDoc } from './fixtures';

const OWNER = 'resident-1';
const localOnly = (backend = new MemoryBackend()) =>
  createStorage({ mode: 'local', backend, ownerId: OWNER, dataKey: KEY });

describe('DocumentRepository', () => {
  it('bumps the version and marks local_only when there is no cloud', async () => {
    const { documents, sync } = await localOnly();
    const saved = await documents.save(makeDoc());
    expect(saved.version).toBe(1);
    expect(saved.syncStatus).toBe('local_only');
    expect(sync.enabled).toBe(false);
    expect(sync.pending).toHaveLength(1);      // waits in the outbox; nothing breaks
  });

  it('checks a step off and back on (undo)', async () => {
    const { documents } = await localOnly();
    const doc = await documents.save(makeDoc());
    const actionId = doc.actions[0].id;

    const done = await documents.setActionCompleted(doc.id, actionId, true);
    expect(done?.actions[0].completed).toBe(true);
    expect(done?.actions[0].completedAt).toBeDefined();

    const undone = await documents.setActionCompleted(doc.id, actionId, false);
    expect(undone?.actions[0]).toMatchObject({ completed: false, completedAt: undefined });
    expect(undone?.version).toBe(3);
  });

  it('merges open steps across documents, soonest first, undated last', async () => {
    const { documents } = await localOnly();
    await documents.save(makeDoc({ title: 'Court order', actions: [
      makeAction({ title: 'Pay fine', due: { type: 'exact', resolvedDate: '2026-10-30' } }),
      makeAction({ title: 'Keep receipts', due: { type: 'none' } }),
    ] }));
    await documents.save(makeDoc({ title: 'Parole', actions: [
      makeAction({ title: 'Check in', due: { type: 'relative', resolvedDate: '2026-10-12' } }),
      makeAction({ title: 'Already done', completed: true }),
    ] }));

    const upcoming = await documents.upcoming();
    expect(upcoming.map(a => a.title)).toEqual(['Check in', 'Pay fine', 'Keep receipts']);
    expect(upcoming[0].docTitle).toBe('Parole');
  });

  it('remove hides the document and queues a cloud delete', async () => {
    const { documents, sync } = await localOnly();
    const doc = await documents.save(makeDoc());
    await documents.remove(doc.id);
    expect(await documents.get(doc.id)).toBeNull();
    expect(sync.pending).toEqual([{ op: 'delete', docId: doc.id }]);   // replaced the upsert
  });

  it("delete my documents wipes this profile's data and queues deletes", async () => {
    const { documents, sync } = await localOnly();
    const a = await documents.save(makeDoc());
    const b = await documents.save(makeDoc());
    await documents.deleteEverything();
    expect((await documents.list()).items).toHaveLength(0);
    expect(sync.pending.map(j => j.docId).sort()).toEqual([a.id, b.id].sort());
  });

  it('keeps the outbox across restarts', async () => {
    const backend = new MemoryBackend();
    const first = await localOnly(backend);
    await first.documents.save(makeDoc());
    const second = await localOnly(backend);
    expect(second.sync.pending).toHaveLength(1);
  });
});
