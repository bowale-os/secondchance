import type { ActionItem, StoredDocument } from '@scr/shared';

let n = 0;

export function makeAction(overrides: Partial<ActionItem> = {}): ActionItem {
  n += 1;
  return {
    id: `a${n}`,
    order: n,
    title: 'Meet your parole officer',
    details: 'Go to the office in person.',
    due: { type: 'exact', resolvedDate: '2026-10-13' },
    priority: 'urgent',
    sourceQuote: 'Report to your supervising officer within 72 hours',
    sourcePage: 1,
    confidence: 0.94,
    completed: false,
    ...overrides,
  };
}

export function makeDoc(overrides: Partial<StoredDocument> = {}): StoredDocument {
  n += 1;
  const now = new Date(Date.UTC(2026, 9, 9, 12, 0, n)).toISOString();
  return {
    id: `doc-${n}`,
    ownerId: 'resident-1',
    title: 'Parole conditions',
    docType: 'parole_conditions',
    issuer: 'Georgia Dept. of Community Supervision',
    language: 'en',
    pages: [],
    extractedText: 'Report to your supervising officer within 72 hours. Case No. 2026-CR-0412.',
    simplified: { markdown: '## What this is\nYour parole rules.', glossary: [] },
    actions: [makeAction()],
    flags: [],
    sharedWith: [],
    createdAt: now,
    updatedAt: now,
    version: 0,
    syncStatus: 'local_only',
    ...overrides,
  };
}

export const KEY = new Uint8Array(32).fill(7);
