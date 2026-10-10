import { describe, expect, it } from 'vitest';
import { addBusinessDays, finalizeActions, reresolveActions, resolveDue } from './dates';
import type { RawAction, RawDue } from './schema';

const due = (d: Partial<RawDue>): RawDue => ({
  type: 'relative', text: null, exactDate: null, anchor: null,
  offsetHours: null, offsetDays: null, businessDays: null, ...d,
});

const action = (d: Partial<RawAction>): RawAction => ({
  order: 1, title: 'Step', details: '', due: due({ type: 'none' }), location: null, contact: null,
  bring: [], priority: 'normal', consequence: null, sourceQuote: 'quote', sourcePage: 1, confidence: 0.9, ...d,
});

describe('resolveDue', () => {
  it('matches the plan: 72 hours after release on Oct 9 = Oct 12', () => {
    const r = resolveDue(due({ anchor: 'release_date', offsetHours: 72 }), { releaseDate: '2026-10-09' });
    expect(r.resolvedDate).toBe('2026-10-12');
    expect(r.explanation).toBe('72 hours after your release on Oct 9 = Oct 12');
  });

  it('rounds partial days down (earlier is safer)', () => {
    expect(resolveDue(due({ anchor: 'release_date', offsetHours: 36 }), { releaseDate: '2026-10-09' }).resolvedDate)
      .toBe('2026-10-10');
  });

  it('skips weekends for business days', () => {
    // Fri Oct 9 2026 + 10 business days = Fri Oct 23
    expect(addBusinessDays('2026-10-09', 10)).toBe('2026-10-23');
    const r = resolveDue(due({ anchor: 'document_date', offsetDays: 10, businessDays: true }), { documentDate: '2026-10-09' });
    expect(r.resolvedDate).toBe('2026-10-23');
    expect(r.explanation).toBe('10 business days after the date on the paper on Oct 9 = Oct 23');
  });

  it('asks for the missing date instead of guessing', () => {
    const r = resolveDue(due({ anchor: 'release_date', offsetHours: 72 }), {});
    expect(r.resolvedDate).toBeNull();
    expect(r.explanation).toMatch(/release date/);
  });

  it('passes exact dates through and explains in Spanish', () => {
    expect(resolveDue(due({ type: 'exact', exactDate: '2026-10-30' }), {}).resolvedDate).toBe('2026-10-30');
    const es = resolveDue(due({ anchor: 'release_date', offsetHours: 72 }), { releaseDate: '2026-10-09' }, 'es');
    expect(es.explanation).toBe('72 horas después de su salida el 9 oct = 12 oct');
  });
});

describe('finalizeActions', () => {
  const today = '2026-10-09';

  it('marks everything on a parole paper urgent', () => {
    const out = finalizeActions([action({ priority: 'low' })], { anchors: {}, docType: 'parole_conditions', today });
    expect(out[0].priority).toBe('urgent');
  });

  it('marks items due within 7 days urgent, but never lowers what the model flagged', () => {
    const out = finalizeActions([
      action({ title: 'Soon', due: due({ type: 'exact', exactDate: '2026-10-15' }) }),
      action({ title: 'Later', due: due({ type: 'exact', exactDate: '2026-11-30' }) }),
      action({ title: 'Model said urgent', priority: 'urgent' }),
    ], { anchors: {}, docType: 'housing', today });
    expect(Object.fromEntries(out.map(a => [a.title, a.priority])))
      .toEqual({ Soon: 'urgent', Later: 'normal', 'Model said urgent': 'urgent' });
  });

  it('orders urgent first, then soonest, and numbers the result', () => {
    const out = finalizeActions([
      action({ order: 1, title: 'Undated' }),
      action({ order: 2, title: 'Nov', due: due({ type: 'exact', exactDate: '2026-11-30' }) }),
      action({ order: 3, title: 'Oct 12', due: due({ type: 'exact', exactDate: '2026-10-12' }) }),
    ], { anchors: {}, docType: 'benefits', today });
    expect(out.map(a => [a.id, a.order, a.title])).toEqual([[ 'a1', 1, 'Oct 12' ], [ 'a2', 2, 'Nov' ], [ 'a3', 3, 'Undated' ]]);
  });

  it('re-resolves once the release date is added later', () => {
    const [first] = finalizeActions([action({ due: due({ anchor: 'release_date', offsetHours: 72 }) })],
      { anchors: {}, docType: 'benefits', today });
    expect(first.due.resolvedDate).toBeNull();
    const [after] = reresolveActions([first], { anchors: { releaseDate: '2026-10-09' }, docType: 'benefits', today });
    expect(after.due.resolvedDate).toBe('2026-10-12');
    expect(after.priority).toBe('urgent');
  });
});
