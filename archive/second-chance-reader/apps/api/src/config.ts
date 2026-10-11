// Server settings, read from environment variables (see .env.example).

export type AiMode = 'fake' | 'claude';

export const config = {
  PORT: Number(process.env.PORT ?? 8787),
  HOST: process.env.HOST ?? '0.0.0.0',
  /**
   * fake   – canned responses (a sample parole letter); no API key, no cost. Default.
   * claude – real Claude calls; needs ANTHROPIC_API_KEY.
   */
  AI_MODE: (process.env.AI_MODE === 'claude' ? 'claude' : 'fake') as AiMode,
  /** Milliseconds each fake AI step waits, so the app's progress screen looks real. */
  FAKE_AI_DELAY_MS: Number(process.env.FAKE_AI_DELAY_MS ?? 600),
  /** Comma-separated origins allowed to call the API from a browser (the Expo web app). */
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? 'http://localhost:8081').split(',').map(s => s.trim()),
};
