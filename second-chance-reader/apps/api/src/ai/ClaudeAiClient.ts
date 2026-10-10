// Real Claude calls. Claude Opus 5.5 reads the page images (messy photos are where
// accuracy matters most); Claude Haiku 5.5 handles the text-only steps.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { AiOutputError, AiRefusalError, type AiClient, type AiRequest, type AiStep } from './AiClient';

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

interface StepSettings {
  model: string;
  effort: Effort;
  /** Re-run on another model if a safety classifier declines (Opus 5.5 supports this server-side). */
  fallbacks: boolean;
}

export const STEP_SETTINGS: Record<AiStep, StepSettings> = {
  extract: { model: 'claude-opus-5-5', effort: 'medium', fallbacks: true },
  classify: { model: 'claude-haiku-5-5', effort: 'low', fallbacks: false },
  simplify: { model: 'claude-haiku-5-5', effort: 'medium', fallbacks: false },
  // Deadlines are the product: give the action list the most thinking.
  actions: { model: 'claude-haiku-5-5', effort: 'high', fallbacks: false },
};

const MAX_ATTEMPTS = 2;   // one retry if the output fails our checks

export class ClaudeAiClient implements AiClient {
  readonly name = 'claude';

  // Reads ANTHROPIC_API_KEY (or another configured credential) from the environment.
  constructor(private client = new Anthropic()) {}

  async generate<T>(req: AiRequest<T>): Promise<T> {
    const s = STEP_SETTINGS[req.step];
    for (let attempt = 1; ; attempt++) {
      const res = await this.client.beta.messages.parse({
        model: s.model,
        max_tokens: 16000,
        system: req.system,
        messages: [{ role: 'user', content: req.content }],
        output_config: { effort: s.effort, format: betaZodOutputFormat(req.schema) },
        ...(s.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      }).catch(err => {
        // The SDK throws while parsing if the JSON fails our .refine() checks.
        if (err instanceof Anthropic.APIError) throw err;
        return null;
      });

      if (res?.stop_reason === 'refusal') throw new AiRefusalError(req.step);
      const checked = res?.stop_reason === 'end_turn' ? req.schema.safeParse(res.parsed_output) : null;
      if (checked?.success) return checked.data;
      if (attempt >= MAX_ATTEMPTS) throw new AiOutputError(req.step);
    }
  }
}
