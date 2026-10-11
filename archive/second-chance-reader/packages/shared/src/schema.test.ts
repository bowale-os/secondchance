import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { actionsOutputSchema } from './schema';

const parole = {
  order: 1,
  title: 'Meet your parole officer',
  details: 'Go to the office in person. Bring your ID and this paper.',
  due: {
    type: 'relative', text: 'within 72 hours of release', exactDate: null,
    anchor: 'release_date', offsetHours: 72, offsetDays: null, businessDays: null,
  },
  location: '123 Main St, Atlanta, GA',
  contact: { name: 'Officer J. Smith', phone: '404-555-0100', email: null },
  bring: ['Photo ID', 'Release papers'],
  priority: 'urgent',
  consequence: 'Missing this can be a violation of your parole.',
  sourceQuote: 'Report to your supervising officer within 72 hours',
  sourcePage: 1,
  confidence: 0.94,
};

describe('actionsOutputSchema', () => {
  it('accepts the example parole action from the design plan', () => {
    expect(actionsOutputSchema.safeParse({ actions: [parole] }).success).toBe(true);
  });

  it('rejects an exact date that is not ISO', () => {
    const bad = { ...parole, due: { ...parole.due, type: 'exact', exactDate: 'Oct 30, 2026' } };
    expect(actionsOutputSchema.safeParse({ actions: [bad] }).success).toBe(false);
  });

  it('rejects confidence outside 0–1 and an empty source quote', () => {
    expect(actionsOutputSchema.safeParse({ actions: [{ ...parole, confidence: 1.4 }] }).success).toBe(false);
    expect(actionsOutputSchema.safeParse({ actions: [{ ...parole, sourceQuote: ' ' }] }).success).toBe(false);
  });

  it('produces a plain JSON schema with every field required', () => {
    const json = JSON.stringify(z.toJSONSchema(actionsOutputSchema, { io: 'input' }));
    expect(json).not.toMatch(/"pattern"|"minimum"|"maximum"|"minLength"/);
    const action = (z.toJSONSchema(actionsOutputSchema) as any).properties.actions.items;
    expect(action.required).toEqual(Object.keys(action.properties));
  });
});
