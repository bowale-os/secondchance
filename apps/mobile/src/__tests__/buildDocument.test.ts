import { describe, expect, it } from 'vitest';
import { ResultCollector, saveProcessedDocument } from '../documents/buildDocument';
import { createStorage } from '../storage/createStorage';
import { MemoryBackend } from '../storage/backends/MemoryBackend';
import { makeAction } from '../storage/__tests__/fixtures';

const KEY = new Uint8Array(32).fill(3);

describe('saving a processed paper', () => {
  it('collects streamed results and saves them with encrypted page images', async () => {
    const backend = new MemoryBackend();
    const storage = await createStorage({ mode: 'local', backend, ownerId: 'p1', dataKey: KEY });
    const result = new ResultCollector();
    expect(result.complete).toBe(false);

    result.add({ stage: 'extracted', pages: [{ n: 1, text: 'Case No. 2026-CR-0412', confidence: 0.9 }], text: '--- Page 1 ---\nCase No. 2026-CR-0412' });
    result.add({ stage: 'classified', meta: { docType: 'court_order', title: 'Court date notice', documentDate: '2026-10-05' } });
    result.add({ stage: 'simplified', simplified: { markdown: '## What this is\nA court date.', glossary: [] } });
    result.add({ stage: 'actions', actions: [makeAction()], flags: [] });
    expect(result.complete).toBe(true);

    const photo = Buffer.from('jpeg bytes: Case No. 2026-CR-0412').toString('base64');
    const doc = await saveProcessedDocument(storage, 'p1', result, [{ name: 'p.jpg', mimeType: 'image/jpeg', dataBase64: photo }], 'en');

    expect(doc).toMatchObject({ ownerId: 'p1', title: 'Court date notice', docType: 'court_order', version: 1, syncStatus: 'local_only' });
    expect(doc.pages[0].key).toBe(`owners/p1/docs/${doc.id}/page-1.jpg`);
    expect(new TextDecoder().decode(await storage.local.getBlob(doc.pages[0]))).toContain('2026-CR-0412');
    expect(new TextDecoder().decode(backend.blobs.get(doc.pages[0].key)!)).not.toContain('2026-CR-0412');
    expect((await storage.documents.list()).items).toHaveLength(1);
  });
});
