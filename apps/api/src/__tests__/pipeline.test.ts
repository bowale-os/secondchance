import { describe, expect, it } from 'vitest';
import type { ProgressEvent } from '@scr/shared';
import { processDocument, type ProcessInput } from '../pipeline';
import { FakeAiClient } from '../ai/FakeAiClient';
import { FAKE_ACTIONS, FAKE_PAGES, FAKE_SIMPLIFY } from '../ai/fakeFixtures';

const page = { name: 'p.jpg', mimeType: 'image/jpeg', dataBase64: Buffer.from('img').toString('base64') };
const input = (over: Partial<ProcessInput> = {}): ProcessInput =>
  ({ files: [page, page], language: 'en', today: '2026-10-09', releaseDate: '2026-10-09', ...over });

async function run(ai = new FakeAiClient(), over: Partial<ProcessInput> = {}) {
  const events: ProgressEvent[] = [];
  const result = await processDocument(ai, input(over), e => events.push(e));
  return { events, result, ai };
}

describe('processDocument (fake AI)', () => {
  it('streams stages in order and finishes', async () => {
    const { events } = await run();
    expect(events.map(e => e.stage)).toEqual([
      'reading', 'extracted', 'classified', 'simplifying', 'finding_actions', 'simplified', 'actions', 'done',
    ]);
  });

  it('reads each page separately and calls the AI once per step', async () => {
    const { ai } = await run();
    expect(ai.calls.map(c => c.step).sort()).toEqual(['actions', 'classify', 'extract', 'extract', 'simplify']);
    expect(ai.calls.filter(c => c.step === 'extract').map(c => c.page)).toEqual([1, 2]);
  });

  it('turns relative deadlines into real dates and puts urgent ones first', async () => {
    const { result } = await run();
    const meet = result.actions.find(a => a.title === 'Meet your parole officer')!;
    expect(meet.due).toMatchObject({ resolvedDate: '2026-10-12', explanation: '72 hours after your release on Oct 9 = Oct 12' });
    // 10 business days after the paper's date (Mon Oct 5) = Mon Oct 19
    expect(result.actions.find(a => a.title.startsWith('Tell your officer'))!.due.resolvedDate).toBe('2026-10-19');
    expect(result.actions.every(a => a.priority === 'urgent')).toBe(true);   // parole paper
    expect(result.actions[0].title).toBe('Meet your parole officer');
  });

  it('asks for the release date when it is missing instead of guessing', async () => {
    const { result } = await run(undefined, { releaseDate: null });
    const meet = result.actions.find(a => a.title === 'Meet your parole officer')!;
    expect(meet.due.resolvedDate).toBeNull();
    expect(meet.due.explanation).toMatch(/release date/);
  });

  it('raises no false alarms on the honest sample letter', async () => {
    const { result } = await run();
    expect(result.flags).toEqual([]);
  });

  it('flags a hard-to-read page and suggests a retake', async () => {
    const ai = new FakeAiClient(0, {
      extract: req => req.page === 2 ? { ...FAKE_PAGES[1], confidence: 0.4, problem: 'Glare across the middle' } : FAKE_PAGES[0],
    });
    const { events, result } = await run(ai);
    expect(events).toContainEqual({ stage: 'retake_suggested', pages: [2] });
    expect(result.flags[0]).toMatchObject({ kind: 'low_confidence_page', page: 2 });
    expect(result.flags[0].detail).toMatch(/glare across the middle/);
  });

  it('catches a number the AI got wrong', async () => {
    const ai = new FakeAiClient(0, {
      simplify: { ...FAKE_SIMPLIFY, markdown: FAKE_SIMPLIFY.markdown.replace('$30.00', '$300.00') },
      actions: { actions: FAKE_ACTIONS.actions.map(a => a.order === 2 ? { ...a, due: { ...a.due, exactDate: '2026-10-31' } } : a) },
    });
    const { result } = await run(ai);
    expect(result.flags.map(f => f.value)).toEqual(['$300.00', '2026-10-31']);
  });

  it('rejects AI output that breaks the schema', async () => {
    const ai = new FakeAiClient(0, { classify: { docType: 'parole_conditions', title: '', issuer: null, documentDate: 'Oct 5' } });
    await expect(run(ai)).rejects.toThrow();
  });
});
