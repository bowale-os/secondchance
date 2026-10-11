import { describe, expect, it } from 'vitest';
import type { ProgressEvent } from '@scr/shared';
import { buildServer } from '../server';
import { FakeAiClient } from '../ai/FakeAiClient';

const app = () => buildServer({ ai: new FakeAiClient(), corsOrigins: ['http://localhost:8081'] });
const body = (over = {}) => ({
  files: [{ name: 'p.jpg', mimeType: 'image/jpeg', dataBase64: Buffer.from('img').toString('base64') }],
  language: 'en', today: '2026-10-09', ...over,
});
const events = (payload: string) => payload.trim().split('\n').map(l => JSON.parse(l) as ProgressEvent);

describe('API', () => {
  it('GET /health says which AI is in use', async () => {
    const res = await (await app()).inject({ method: 'GET', url: '/health' });
    expect(res.json()).toEqual({ ok: true, ai: 'fake' });
  });

  it('POST /process streams newline-delimited progress events with CORS headers', async () => {
    const res = await (await app()).inject({
      method: 'POST', url: '/process', payload: body(), headers: { origin: 'http://localhost:8081' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/x-ndjson/);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    const stream = events(res.payload);
    expect(stream.at(-1)).toEqual({ stage: 'done' });
    expect(stream.find(e => e.stage === 'actions')).toBeDefined();
  });

  it('rejects a malformed request', async () => {
    const res = await (await app()).inject({ method: 'POST', url: '/process', payload: body({ language: 'fr' }) });
    expect(res.statusCode).toBe(400);
  });

  it('turns a bad file into a plain error event', async () => {
    const res = await (await app()).inject({
      method: 'POST', url: '/process',
      payload: body({ files: [{ name: 'x.zip', mimeType: 'application/zip', dataBase64: 'AA==' }] }),
    });
    expect(events(res.payload)).toEqual([
      { stage: 'error', message: '"x.zip" is not a file type we can read. Use a photo, PDF, or Word file.' },
    ]);
  });

  it('hides internal error details from the resident', async () => {
    const ai = new FakeAiClient(0, { classify: () => { throw new Error('Case 2026-CR-0412 secret detail'); } });
    const server = await buildServer({ ai, corsOrigins: [] });
    const res = await server.inject({ method: 'POST', url: '/process', payload: body() });
    const last = events(res.payload).at(-1)!;
    expect(last.stage).toBe('error');
    expect(JSON.stringify(last)).not.toContain('2026-CR-0412');
  });
});
