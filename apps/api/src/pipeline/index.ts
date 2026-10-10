// The pipeline: preprocess → read pages → classify → simplify → find actions →
// calculate dates → verify. Results stream back as each stage finishes.
//
// The server keeps nothing: no document text or images are stored or logged here.
// The app saves results on the device through DocumentRepository.
// TODO(cloud): if STORAGE_MODE !== 'local', results could also be persisted via AwsStorageProvider.
import {
  LOW_CONFIDENCE_THRESHOLD, finalizeActions,
  type DocumentMeta, type Flag, type ProgressEvent,
} from '@scr/shared';
import type { AiClient } from '../ai/AiClient';
import { preprocess, type UploadFile } from './preprocess';
import { classify, extractActions, extractText, simplify } from './steps';
import { verify } from './verify';

export interface ProcessInput {
  files: UploadFile[];
  language: string;
  /** The resident's local date (YYYY-MM-DD), for "due within 7 days". */
  today: string;
  releaseDate?: string | null;    // from the Confirm screen, optional
  receivedDate?: string | null;
}

export async function processDocument(ai: AiClient, input: ProcessInput, emit: (e: ProgressEvent) => void) {
  const pages = await preprocess(input.files);

  emit({ stage: 'reading' });
  const extracted = await extractText(ai, pages);
  emit({ stage: 'extracted', pages: extracted.pages.map(({ n, text, confidence }) => ({ n, text, confidence })), text: extracted.text });

  const lowConf = extracted.pages.filter(p => p.confidence < LOW_CONFIDENCE_THRESHOLD);
  if (lowConf.length) emit({ stage: 'retake_suggested', pages: lowConf.map(p => p.n) });

  const classified = await classify(ai, extracted.text);
  const meta: DocumentMeta = {
    docType: classified.docType,
    title: classified.title,
    issuer: classified.issuer ?? undefined,
    documentDate: classified.documentDate ?? undefined,
  };
  emit({ stage: 'classified', meta });

  // Simplify and find actions at the same time; the simple version streams back first if ready.
  emit({ stage: 'simplifying' });
  const simplifiedP = simplify(ai, extracted.text, input.language).then(s => {
    emit({ stage: 'simplified', simplified: s });
    return s;
  });
  emit({ stage: 'finding_actions' });
  const rawP = extractActions(ai, extracted.text, classified, input.language);
  const [simplified, raw] = await Promise.all([simplifiedP, rawP]);

  const actions = finalizeActions(raw, {
    anchors: { documentDate: meta.documentDate, releaseDate: input.releaseDate, receivedDate: input.receivedDate },
    docType: meta.docType,
    today: input.today,
    language: input.language,
  });

  const flags: Flag[] = [
    ...lowConf.map(p => ({
      kind: 'low_confidence_page' as const,
      page: p.n,
      detail: `Page ${p.n} was hard to read${p.problem ? ` (${p.problem.toLowerCase()})` : ''}. Check it against your paper, or retake the photo.`,
    })),
    ...verify(extracted.text, simplified, actions),
  ];
  emit({ stage: 'actions', actions, flags });
  emit({ stage: 'done' });

  return { extracted, meta, simplified, actions, flags };
}
