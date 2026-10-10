// Stand-in for Claude while there is no API key. Returns the sample parole letter for
// any upload, after a short delay, and checks its own answers against the same schemas
// real responses must pass. It does not look at the uploaded images.
import type { AiClient, AiRequest, AiStep } from './AiClient';
import { FAKE_ACTIONS, FAKE_CLASSIFY, FAKE_PAGES, FAKE_SIMPLIFY } from './fakeFixtures';

export type FakeResponses = { [K in AiStep]?: object | ((req: AiRequest<unknown>) => unknown) };

export class FakeAiClient implements AiClient {
  readonly name = 'fake';
  readonly calls: AiRequest<unknown>[] = [];

  constructor(private delayMs = 0, private overrides: FakeResponses = {}) {}

  async generate<T>(req: AiRequest<T>): Promise<T> {
    this.calls.push(req as AiRequest<unknown>);
    if (this.delayMs) await new Promise(r => setTimeout(r, this.delayMs));

    const override = this.overrides[req.step];
    const answer = override === undefined
      ? this.defaultAnswer(req)
      : typeof override === 'function' ? override(req as AiRequest<unknown>) : override;
    return req.schema.parse(answer);
  }

  private defaultAnswer(req: AiRequest<unknown>) {
    switch (req.step) {
      case 'extract': return FAKE_PAGES[((req.page ?? 1) - 1) % FAKE_PAGES.length];
      case 'classify': return FAKE_CLASSIFY;
      case 'simplify': return FAKE_SIMPLIFY;
      case 'actions': return FAKE_ACTIONS;
    }
  }
}
