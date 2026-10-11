import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { MemoryBackend } from '../backends/MemoryBackend';
import { IndexedDbBackend } from '../backends/IndexedDbBackend';
import { LocalStorageProvider } from '../providers/LocalStorageProvider';
import { BlobNotFoundError } from '../errors';
import type { LocalBackend } from '../LocalBackend';
import { KEY, makeDoc } from './fixtures';

const backends: [string, () => LocalBackend][] = [
  ['MemoryBackend', () => new MemoryBackend()],
  ['IndexedDbBackend', () => new IndexedDbBackend('test', new IDBFactory())],
];

describe.each(backends)('LocalStorageProvider on %s', (_, makeBackend) => {
  async function setup() {
    const backend = makeBackend();
    const local = new LocalStorageProvider(backend, KEY);
    await local.init();
    return { backend, local };
  }

  it('saves and reads back a document, storing only ciphertext', async () => {
    const { backend, local } = await setup();
    const doc = makeDoc();
    await local.saveDocument(doc);
    expect(await local.getDocument(doc.id)).toEqual(doc);
    const raw = await backend.getDoc(doc.id);
    expect(raw?.ciphertext).not.toContain('2026-CR-0412');
  });

  it('lists newest first, filters by type, and searches decrypted text', async () => {
    const { local } = await setup();
    const parole = makeDoc();
    const housing = makeDoc({ title: 'House rules', docType: 'housing', extractedText: 'Curfew is 10 pm.' });
    await local.saveDocument(parole);
    await local.saveDocument(housing);

    const all = await local.listDocuments({ ownerId: 'resident-1' });
    expect(all.items.map(d => d.id)).toEqual([housing.id, parole.id]);
    expect((await local.listDocuments({ ownerId: 'resident-1', docType: 'housing' })).items).toHaveLength(1);
    expect((await local.listDocuments({ ownerId: 'resident-1', search: 'CURFEW' })).items[0].id).toBe(housing.id);
    expect((await local.listDocuments({ ownerId: 'someone-else' })).items).toHaveLength(0);
  });

  it('pages with a cursor', async () => {
    const { local } = await setup();
    for (let i = 0; i < 3; i++) await local.saveDocument(makeDoc());
    const first = await local.listDocuments({ ownerId: 'resident-1', limit: 2 });
    expect(first.items).toHaveLength(2);
    const second = await local.listDocuments({ ownerId: 'resident-1', limit: 2, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
  });

  it('soft-deletes, then purges after 30 days along with its files', async () => {
    const { backend, local } = await setup();
    const page = await local.putBlob('docs/x/page-1.jpg', new Uint8Array([1, 2, 3]), 'image/jpeg');
    const doc = makeDoc({ pages: [page] });
    await local.saveDocument(doc);

    await local.deleteDocument(doc.id);
    expect(await local.getDocument(doc.id)).toBeNull();
    expect(await backend.getDoc(doc.id)).not.toBeNull();     // still there for sync

    await local.purgeDeleted('resident-1', new Date(Date.now() + 31 * 86_400_000));
    expect(await backend.getDoc(doc.id)).toBeNull();
    await expect(local.getBlob(page)).rejects.toThrow(BlobNotFoundError);
  });

  it('encrypts files and reports a plaintext checksum', async () => {
    const { backend, local } = await setup();
    const data = new TextEncoder().encode('SSN 123-45-6789');
    const ref = await local.putBlob('docs/x/page-1.jpg', data, 'image/jpeg');
    expect(ref).toMatchObject({ size: data.byteLength, location: 'local', contentType: 'image/jpeg' });
    const raw = await backend.getBlob(ref.key);
    expect(new TextDecoder().decode(raw!)).not.toContain('123-45-6789');
    expect(await local.getBlob(ref)).toEqual(data);
  });

  it('wipe removes everything', async () => {
    const { local } = await setup();
    await local.saveDocument(makeDoc());
    await local.setMeta('k', 'v');
    await local.wipe();
    expect((await local.listDocuments({ ownerId: 'resident-1' })).items).toHaveLength(0);
    expect(await local.getMeta('k')).toBeNull();
  });
});
