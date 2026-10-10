import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-speech', () => ({ speak: vi.fn(), stop: vi.fn(async () => {}), isSpeakingAsync: vi.fn(async () => false) }));
const { backTenSeconds, speakableText, splitSentences } = await import('../tts/speech');
const { dueWords, friendlyDate, parseUsDate } = await import('../text/format');

describe('read-aloud helpers', () => {
  it('reads markdown as plain sentences', () => {
    const text = speakableText('## What this is\nYour **parole** rules.\n- Meet your officer. Bring ID.');
    expect(splitSentences(text)).toEqual(['What this is', 'Your parole rules.', 'Meet your officer.', 'Bring ID.']);
  });

  it('does not split on "J. Smith" or "St." mid-sentence', () => {
    expect(splitSentences('Call Officer J. Smith today. Go to 123 Main St. now.')).toEqual([
      'Call Officer J. Smith today.', 'Go to 123 Main St. now.',
    ]);
  });

  it('steps back about 10 seconds of speech', () => {
    const s = Array.from({ length: 10 }, () => 'one two three four five six seven eight nine ten.');
    expect(backTenSeconds(s, 6, 1)).toBe(3);      // 25 words ≈ 3 sentences of 10
    expect(backTenSeconds(s, 6, 1.5)).toBe(2);    // faster speech covers more words
    expect(backTenSeconds(s, 0, 1)).toBe(0);
  });
});

describe('date wording', () => {
  it('says dates the friendly way', () => {
    expect(friendlyDate('2026-10-13')).toBe('Tue, Oct 13');
    expect(friendlyDate('2026-10-13', 'es')).toBe('mar 13 oct');
    expect(dueWords('2026-10-09', '2026-10-09')).toBe('Due today');
    expect(dueWords('2026-10-10', '2026-10-09')).toBe('Due tomorrow');
    expect(dueWords('2026-10-13', '2026-10-09')).toBe('Due in 4 days');
    expect(dueWords('2026-10-07', '2026-10-09')).toBe('Overdue by 2 days');
  });

  it('reads typed dates month first and rejects impossible ones', () => {
    expect(parseUsDate('10/9/2026')).toBe('2026-10-09');
    expect(parseUsDate('2/30/2026')).toBeNull();
    expect(parseUsDate('next tuesday')).toBeNull();
  });
});
