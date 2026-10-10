import { describe, expect, it } from 'vitest';
import { actionsOutputSchema } from './schema';

describe('actionsOutputSchema', () => {
  it('accepts the example parole action from the design plan', () => {
    const parsed = actionsOutputSchema.safeParse({
      actions: [{
        order: 1,
        title: 'Meet your parole officer',
        details: 'Go to the office in person. Bring your ID and this paper.',
        due: { type: 'relative', text: 'within 72 hours of release', anchor: 'release_date', offsetHours: 72 },
        location: '123 Main St, Atlanta, GA',
        contact: { name: 'Officer J. Smith', phone: '404-555-0100' },
        bring: ['Photo ID', 'Release papers'],
        priority: 'urgent',
        consequence: 'Missing this can be a violation of your parole.',
        sourceQuote: 'Report to your supervising officer within 72 hours...',
        sourcePage: 1,
        confidence: 0.94,
      }],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an exact date that is not ISO', () => {
    const parsed = actionsOutputSchema.safeParse({
      actions: [{
        order: 1, title: 'Pay fee', details: '', priority: 'normal',
        due: { type: 'exact', exactDate: 'Oct 30, 2026' },
        sourceQuote: 'Pay by Oct 30, 2026', sourcePage: 1, confidence: 0.9,
      }],
    });
    expect(parsed.success).toBe(false);
  });
});
