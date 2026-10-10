import { describe, expect, it, vi } from 'vitest';
import type { ProgressEvent } from '@scr/shared';

vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
const { localToday, ndjsonLines, processDocument } = await import('../api/processStream');

function streamOf(chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); },
  });
}

const req = { files: [], language: 'en', today: '2026-10-09', releaseDate: null, receivedDate: null };

async function run(fetchImpl: NonNullable<NonNullable<Parameters<typeof processDocument>[2]>['fetchImpl']>) {
  const events: ProgressEvent[] = [];
  await processDocument(req, e => events.push(e), { fetchImpl, apiUrl: 'http://api.test' });
  return events;
}

describe('processStream', () => {
  it('joins lines split across network chunks', async () => {
    const lines: string[] = [];
    for await (const l of ndjsonLines(streamOf(['{"a":', '1}\n{"b"', ':2}\n\n{"c":3}']))) lines.push(l);
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it('hands each event over as it arrives', async () => {
    const events = await run(async () => ({ ok: true, status: 200, body: streamOf(['{"stage":"reading"}\n', '{"stage":"done"}\n']) }));
    expect(events).toEqual([{ stage: 'reading' }, { stage: 'done' }]);
  });

  it('reports a dropped connection', async () => {
    const events = await run(async () => ({ ok: true, status: 200, body: streamOf(['{"stage":"reading"}\n']) }));
    expect(events.at(-1)).toMatchObject({ stage: 'error', message: expect.stringMatching(/connection dropped/) });
  });

  it('explains being offline and being rate limited in plain words', async () => {
    expect((await run(async () => { throw new TypeError('Network request failed'); }))[0])
      .toMatchObject({ stage: 'error', message: expect.stringMatching(/internet connection/) });
    expect((await run(async () => ({ ok: false, status: 429, body: null })))[0])
      .toMatchObject({ stage: 'error', message: expect.stringMatching(/wait a minute/) });
  });

  it("uses the resident's local date, not UTC", () => {
    expect(localToday(new Date(2026, 9, 9, 23, 30))).toBe('2026-10-09');
  });
});
