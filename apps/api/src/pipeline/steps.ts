// The AI steps. Each builds its prompt, calls the AI through AiClient, and gets back
// output already checked against the shared schemas.
import type Anthropic from '@anthropic-ai/sdk';
import {
  actionsOutputSchema, classifyOutputSchema, extractOutputSchema, simplifyOutputSchema,
  type ClassifyOutput, type ExtractedPage, type RawAction, type SimplifyOutput,
} from '@scr/shared';
import type { AiClient } from '../ai/AiClient';
import { CLASSIFY_SYSTEM, EXTRACT_SYSTEM, actionsSystem, documentText, simplifySystem } from '../ai/prompts';
import type { Page } from './preprocess';

const PAGE_CONCURRENCY = 4;

export interface Extracted {
  pages: (ExtractedPage & { problem: string | null })[];
  text: string;
}

function pageBlock(page: Page): Anthropic.Beta.BetaContentBlockParam {
  switch (page.kind) {
    case 'image': return { type: 'image', source: { type: 'base64', media_type: page.mediaType, data: page.data } };
    case 'pdf': return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: page.data } };
    case 'text': return { type: 'text', text: page.text };
  }
}

/** Reads every page (several at a time). Typed text from Word files needs no AI. */
export async function extractText(ai: AiClient, pages: Page[]): Promise<Extracted> {
  const results: Extracted['pages'] = new Array(pages.length);
  let next = 0;

  async function worker() {
    while (next < pages.length) {
      const i = next++;
      const page = pages[i];
      if (page.kind === 'text') {
        results[i] = { n: page.n, text: page.text, confidence: 1, problem: null };
        continue;
      }
      const out = await ai.generate({
        step: 'extract',
        page: page.n,
        system: EXTRACT_SYSTEM,
        schema: extractOutputSchema,
        content: [pageBlock(page), { type: 'text', text: `Transcribe page ${page.n}.` }],
      });
      results[i] = { n: page.n, ...out };
    }
  }

  await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, pages.length) }, worker));
  return { pages: results, text: documentText(results) };
}

export function classify(ai: AiClient, text: string): Promise<ClassifyOutput> {
  return ai.generate({
    step: 'classify',
    system: CLASSIFY_SYSTEM,
    schema: classifyOutputSchema,
    content: [{ type: 'text', text: `<document>\n${text}\n</document>` }],
  });
}

export function simplify(ai: AiClient, text: string, language: string): Promise<SimplifyOutput> {
  return ai.generate({
    step: 'simplify',
    system: simplifySystem(language),
    schema: simplifyOutputSchema,
    content: [{ type: 'text', text: `<document>\n${text}\n</document>` }],
  });
}

export async function extractActions(ai: AiClient, text: string, meta: ClassifyOutput, language: string): Promise<RawAction[]> {
  const context = [
    `Document type: ${meta.docType}`,
    `Date printed on the paper: ${meta.documentDate ?? 'none'}`,
  ].join('\n');
  const out = await ai.generate({
    step: 'actions',
    system: actionsSystem(language),
    schema: actionsOutputSchema,
    content: [{ type: 'text', text: `${context}\n\n<document>\n${text}\n</document>` }],
  });
  return out.actions;
}
