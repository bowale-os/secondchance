import { describe, expect, it } from 'vitest';
import type { ActionItem } from '@scr/shared';
import { findCaseNumbers, findDates, findMoney, findPhones, verify } from '../pipeline/verify';

const ORIGINAL = `Case No. 2026-CR-0412. Report within 72 hours. Officer J. Smith, (404) 555-0100.
Pay a fee of $1,250.00 by October 30, 2026. Hearing on 11/02/2026. Bring this by Dec 3.`;

const action = (a: Partial<ActionItem>): ActionItem => ({
  id: 'a1', order: 1, title: 'Pay the fee', details: '', due: { type: 'none' }, priority: 'normal',
  sourceQuote: 'Pay a fee of $1,250.00 by October 30, 2026.', sourcePage: 1, confidence: 0.9, completed: false, ...a,
});

describe('finders', () => {
  it('reads dates in English, Spanish, and numeric forms', () => {
    expect(findDates('October 30, 2026 · Oct. 30 2026 · 30 de octubre de 2026 · 10/30/2026 · 2026-10-30')
      .map(d => d.iso)).toEqual(Array(5).fill('2026-10-30'));
    expect(findDates('by Dec 3')[0]).toMatchObject({ iso: null, monthDay: '12-03' });
  });

  it('reads phones, money, and case numbers but not ordinary words', () => {
    expect(findPhones('Call (404) 555-0100 or 404.555.0100').map(p => p.key)).toEqual(['4045550100', '4045550100']);
    expect(findMoney('$1,250.00 and $30').map(m => m.key)).toEqual(['1250.00', '30.00']);
    expect(findCaseNumbers('Case 2026-CR-0412, a 10-day wait, ZIP 30303').map(c => c.value)).toEqual(['2026-CR-0412', '30303']);
  });
});

describe('verify', () => {
  it('passes when every value matches the paper, in any format', () => {
    const flags = verify(ORIGINAL, {
      markdown: 'Pay $1,250 by Oct 30, 2026. Call 404-555-0100. Case 2026-CR-0412. Hearing: November 2, 2026. By December 3.',
      glossary: [],
    }, [action({ due: { type: 'exact', resolvedDate: '2026-10-30' } })]);
    expect(flags).toEqual([]);
  });

  it('flags a changed amount, date, phone, or case number', () => {
    const flags = verify(ORIGINAL, {
      markdown: 'Pay $1,500 by October 31, 2026. Call (404) 555-0199. Case 2026-CR-0413.',
      glossary: [],
    }, []);
    expect(flags.map(f => f.value)).toEqual(['October 31, 2026', '(404) 555-0199', '$1,500', '2026-CR-0413']);
    expect(flags[0].detail).toMatch(/Double-check this/);
  });

  it('flags an action whose due date or source quote is not on the paper', () => {
    const flags = verify(ORIGINAL, { markdown: 'ok', glossary: [] }, [
      action({ id: 'a1', due: { type: 'exact', resolvedDate: '2026-10-31' } }),
      action({ id: 'a2', sourceQuote: 'Attend anger management every Tuesday.' }),
      action({ id: 'a3', sourceQuote: 'Report within 72 hours...' }),   // trimmed quotes are fine
    ]);
    expect(flags.map(f => [f.kind, f.actionId])).toEqual([
      ['unverified_value', 'a1'],
      ['unverified_source', 'a2'],
    ]);
  });

  it('accepts a year the model filled in for a yearless date on the paper', () => {
    const flags = verify(ORIGINAL, { markdown: 'ok', glossary: [] },
      [action({ due: { type: 'exact', resolvedDate: '2026-12-03' } })]);
    expect(flags).toEqual([]);
  });
});
