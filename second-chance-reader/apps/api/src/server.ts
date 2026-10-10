// HTTP API. POST /process streams progress as newline-delimited JSON (one ProgressEvent
// per line) so the Processing screen can show each result as soon as it is ready.
import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { LANGUAGES, MAX_PAGES, MAX_UPLOAD_BYTES, type ProgressEvent } from '@scr/shared';
import { UserFacingError, type AiClient } from './ai/AiClient';
import { processDocument } from './pipeline';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const processBody = z.object({
  files: z.array(z.object({
    name: z.string().max(200),
    mimeType: z.string().max(100),
    dataBase64: z.string().min(1),
  })).min(1).max(MAX_PAGES),
  language: z.enum(LANGUAGES.map(l => l.code) as [string, ...string[]]),
  today: isoDate,
  releaseDate: isoDate.nullish(),
  receivedDate: isoDate.nullish(),
});

export interface ServerOptions {
  ai: AiClient;
  corsOrigins: string[];
  logger?: FastifyServerOptions['logger'];
}

export async function buildServer({ ai, corsOrigins, logger = false }: ServerOptions) {
  const app = Fastify({
    logger,
    // base64 adds a third; leave room for the JSON around it.
    bodyLimit: Math.ceil(MAX_UPLOAD_BYTES * 1.4),
  });

  await app.register(cors, { origin: corsOrigins });
  await app.register(rateLimit, { global: false });

  app.get('/health', async () => ({ ok: true, ai: ai.name }));

  app.post('/process', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const parsed = processBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'The request was not in the right shape.' });
    }

    // Take over the response so events can be written as they happen.
    reply.hijack();
    reply.raw.writeHead(200, {
      ...(reply.getHeaders() as Record<string, string>),   // keeps the CORS headers
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
    const emit = (e: ProgressEvent) => reply.raw.write(JSON.stringify(e) + '\n');

    try {
      await processDocument(ai, parsed.data, emit);
    } catch (err) {
      const message = err instanceof UserFacingError
        ? err.message
        : 'Something went wrong on our side. Please try again in a minute.';
      // Log the error kind only: messages from deeper layers could quote document text.
      req.log.error({ errName: (err as Error)?.name }, 'process failed');
      emit({ stage: 'error', message });
    } finally {
      reply.raw.end();
    }
  });

  return app;
}
