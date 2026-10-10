import { describe, expect, it, vi } from 'vitest';
import { SyncService } from '../SyncService';
import { MemoryStorageProvider } from '../providers/MemoryStorageProvider';
import { SyncConflictError } from '../errors';
import { makeDoc } from './fixtures';

function setup(remoteAvailable = true) {
  const local = new MemoryStorageProvider('local');
  const remote = new MemoryStorageProvider('cloud');
  remote.available = remoteAvailable;
  return { local, remote, sync: new SyncService(local, remote) };
}

describe('SyncService', () => {
  it('waits quietly when there is no cloud', async () => {
    const local = new MemoryStorageProvider();
    const sync = new SyncService(local, null);
    await sync.enqueue({ op: 'upsert', docId: 'x' });
    await sync.flush();
    expect(sync.pending).toHaveLength(1);
  });

  it('uploads documents and marks them synced', async () => {
    const { local, remote, sync } = setup();
    const doc = makeDoc({ version: 1, syncStatus: 'pending' });
    await local.saveDocument(doc);
    await sync.enqueue({ op: 'upsert', docId: doc.id });
    await sync.flush();
    expect(remote.docs.get(doc.id)?.syncStatus).toBe('synced');
    expect(local.docs.get(doc.id)?.syncStatus).toBe('synced');
    expect(sync.pending).toHaveLength(0);
  });

  it('holds jobs while offline and sends them when back online', async () => {
    const { local, remote, sync } = setup(false);
    const doc = makeDoc();
    await local.saveDocument(doc);
    await sync.enqueue({ op: 'upsert', docId: doc.id });
    await sync.flush();
    expect(remote.docs.size).toBe(0);

    remote.available = true;
    await sync.flush();
    expect(remote.docs.has(doc.id)).toBe(true);
  });

  it('keeps a failed job for retry and counts attempts', async () => {
    const { local, remote, sync } = setup();
    const doc = makeDoc();
    await local.saveDocument(doc);
    vi.spyOn(remote, 'saveDocument').mockRejectedValueOnce(new Error('network down'));
    await sync.enqueue({ op: 'upsert', docId: doc.id });
    await sync.flush();
    expect(sync.pending[0]).toMatchObject({ docId: doc.id, attempts: 1 });

    await sync.flush();
    expect(sync.pending).toHaveLength(0);
  });

  it('marks a version conflict and moves on', async () => {
    const { local, remote, sync } = setup();
    const doc = makeDoc();
    await local.saveDocument(doc);
    vi.spyOn(remote, 'saveDocument').mockRejectedValueOnce(new SyncConflictError('/documents/x'));
    await sync.enqueue({ op: 'upsert', docId: doc.id });
    await sync.flush();
    expect(local.docs.get(doc.id)?.syncStatus).toBe('conflict');
    expect(sync.pending).toHaveLength(0);
  });

  it('does not overwrite an edit made during upload', async () => {
    const { local, remote, sync } = setup();
    const doc = makeDoc({ version: 1 });
    await local.saveDocument(doc);
    vi.spyOn(remote, 'saveDocument').mockImplementationOnce(async d => {
      await local.saveDocument({ ...doc, version: 2, title: 'Edited' });   // user edits mid-upload
      return d;
    });
    await sync.enqueue({ op: 'upsert', docId: doc.id });
    await sync.flush();
    expect(local.docs.get(doc.id)).toMatchObject({ version: 2, title: 'Edited' });
  });

  it('sends deletes', async () => {
    const { remote, sync } = setup();
    const doc = makeDoc();
    await remote.saveDocument(doc);
    await sync.enqueue({ op: 'delete', docId: doc.id });
    await sync.flush();
    expect(await remote.getDocument(doc.id)).toBeNull();
  });
});
