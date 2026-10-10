// The pipeline talks to the AI only through this interface, so the real Claude client
// and the fake one used for development and tests are interchangeable.
import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';

export type AiStep = 'extract' | 'classify' | 'simplify' | 'actions';

export interface AiRequest<T> {
  step: AiStep;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: z.ZodType<T>;
  /** Which page an extract call is for (used by the fake client and in logs). */
  page?: number;
}

export interface AiClient {
  readonly name: string;
  generate<T>(req: AiRequest<T>): Promise<T>;
}

/** Errors whose message is safe to show a resident. Never includes document text. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export class AiRefusalError extends UserFacingError {
  constructor(step: AiStep) {
    super(`We couldn't finish this paper (step: ${step}). Please show it to your case manager.`);
    this.name = 'AiRefusalError';
  }
}

export class AiOutputError extends UserFacingError {
  constructor(step: AiStep) {
    super(`Something went wrong reading this paper (step: ${step}). Please try again.`);
    this.name = 'AiOutputError';
  }
}
