// Zod schemas for what the AI returns. The API validates every model response
// against these before anything reaches a user.
import { z } from 'zod';

export const docTypeSchema = z.enum([
  'parole_conditions', 'probation', 'court_order', 'benefits', 'housing',
  'employment', 'medical', 'id', 'child_support', 'other',
]);

export const classifyOutputSchema = z.object({
  docType: docTypeSchema,
  title: z.string().min(1).max(80),
  issuer: z.string().nullish(),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export const simplifyOutputSchema = z.object({
  markdown: z.string().min(1),
  glossary: z.array(z.object({ term: z.string(), meaning: z.string() })),
});

export const dueSchema = z.object({
  type: z.enum(['exact', 'relative', 'none']),
  text: z.string().nullish(),
  // Exact dates the model read off the paper, as ISO; relative ones are resolved in code.
  exactDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  anchor: z.enum(['document_date', 'release_date', 'received_date']).nullish(),
  offsetHours: z.number().nullish(),
  businessDays: z.number().int().nullish(),
});

export const rawActionSchema = z.object({
  order: z.number().int(),
  title: z.string().min(1),
  details: z.string(),
  due: dueSchema,
  location: z.string().nullish(),
  contact: z.object({
    name: z.string().nullish(),
    phone: z.string().nullish(),
    email: z.string().nullish(),
  }).nullish(),
  bring: z.array(z.string()).nullish(),
  priority: z.enum(['urgent', 'normal', 'low']),
  consequence: z.string().nullish(),
  sourceQuote: z.string(),
  sourcePage: z.number().int().min(1),
  confidence: z.number().min(0).max(1),
});

export const actionsOutputSchema = z.object({
  actions: z.array(rawActionSchema),
});

export type ClassifyOutput = z.infer<typeof classifyOutputSchema>;
export type SimplifyOutput = z.infer<typeof simplifyOutputSchema>;
export type RawAction = z.infer<typeof rawActionSchema>;
export type ActionsOutput = z.infer<typeof actionsOutputSchema>;
