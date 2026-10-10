import { config } from './config';
import { buildServer } from './server';
import { ClaudeAiClient } from './ai/ClaudeAiClient';
import { FakeAiClient } from './ai/FakeAiClient';

const ai = config.AI_MODE === 'claude' ? new ClaudeAiClient() : new FakeAiClient(config.FAKE_AI_DELAY_MS);

const app = await buildServer({
  ai,
  corsOrigins: config.CORS_ORIGINS,
  // Request lines only (method, URL, status). Bodies are never logged: they hold documents.
  logger: { level: 'info' },
});

await app.listen({ port: config.PORT, host: config.HOST });
app.log.info(`AI mode: ${ai.name}${ai.name === 'fake' ? ' (sample parole letter, no API calls)' : ''}`);
