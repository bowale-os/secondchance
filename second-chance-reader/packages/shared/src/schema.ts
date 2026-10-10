// Zod schemas for what the AI returns. The same schema is sent to Claude as the required
// output shape (structured outputs) and then checked again on our side.
//
// Format rules (ISO dates, 0–1 confidence, non-empty strings) are written as .refine()
// checks: they run on our side after the response arrives, and stay out of the JSON
// schema sent to the API, which keeps that schema to plain types. Every field is
// required-but-nullable rather than optional, for the same reason.
import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z.string().refine(s => ISO_DATE.test(s), 'Use YYYY-MM-DD');
const nonEmpty = z.string().refine(s => s.trim().length > 0, 'Must not be empty');
const unit = z.number().refine(n => n >= 0 && n <= 1, 'Must be between 0 and 1');
const wholeNumber = z.number().refine(Number.isInteger, 'Must be a whole number');
const positiveInt = wholeNumber.refine(n => n >= 1, 'Must be 1 or more');

export const docTypeSchema = z.enum([
  'parole_conditions', 'probation', 'court_order', 'benefits', 'housing',
  'employment', 'medical', 'id', 'child_support', 'other',
]);

export const extractOutputSchema = z.object({
  text: z.string(),              // full text of the page, in reading order
  confidence: unit,              // how sure the model is it read the page correctly
  problem: z.string().nullable(), // e.g. "bottom third is blurry"
});

export const classifyOutputSchema = z.object({
  docType: docTypeSchema,
  title: nonEmpty,
  issuer: z.string().nullable(),
  documentDate: isoDate.nullable(),
});

export const simplifyOutputSchema = z.object({
  markdown: nonEmpty,
  glossary: z.array(z.object({ term: z.string(), meaning: z.string() })),
});

export const dueSchema = z.object({
  type: z.enum(['exact', 'relative', 'none']),
  text: z.string().nullable(),
  // Exact dates the model read off the paper, as ISO; relative ones are resolved in code.
  exactDate: isoDate.nullable(),
  anchor: z.enum(['document_date', 'release_date', 'received_date']).nullable(),
  offsetHours: z.number().nullable(),
  offsetDays: wholeNumber.nullable(),
  businessDays: z.boolean().nullable(),
});

export const rawActionSchema = z.object({
  order: positiveInt,
  title: nonEmpty,
  details: z.string(),
  due: dueSchema,
  location: z.string().nullable(),
  contact: z.object({
    name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }).nullable(),
  bring: z.array(z.string()),
  priority: z.enum(['urgent', 'normal', 'low']),
  consequence: z.string().nullable(),
  sourceQuote: nonEmpty,
  sourcePage: positiveInt,
  confidence: unit,
});

export const actionsOutputSchema = z.object({
  actions: z.array(rawActionSchema),
});

export type ExtractOutput = z.infer<typeof extractOutputSchema>;
export type ClassifyOutput = z.infer<typeof classifyOutputSchema>;
export type SimplifyOutput = z.infer<typeof simplifyOutputSchema>;
export type RawDue = z.infer<typeof dueSchema>;
export type RawAction = z.infer<typeof rawActionSchema>;
export type ActionsOutput = z.infer<typeof actionsOutputSchema>;
