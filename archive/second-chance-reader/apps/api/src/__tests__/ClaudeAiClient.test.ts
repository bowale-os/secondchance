import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { classifyOutputSchema } from '@scr/shared';
import { ClaudeAiClient } from '../ai/ClaudeAiClient';
import { AiOutputError, AiRefusalError } from '../ai/AiClient';
import { FAKE_CLASSIFY } from '../ai/fakeFixtures';

function mockClient(...responses: object[]) {
  const parse = vi.fn();
  for (const r of responses) parse.mockResolvedValueOnce(r);
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

const req = (step: 'extract' | 'classify') => ({
  step, system: 'sys', content: [{ type: 'text' as const, text: 'doc' }], schema: classifyOutputSchema,
});

describe('ClaudeAiClient', () => {
  it('reads pages with Opus 5.5 and a refusal fallback, text steps with Haiku 5.5', async () => {
    const { client, parse } = mockClient(
      { stop_reason: 'end_turn', parsed_output: FAKE_CLASSIFY },
      { stop_reason: 'end_turn', parsed_output: FAKE_CLASSIFY },
    );
    const ai = new ClaudeAiClient(client);
    await ai.generate(req('extract'));
    await ai.generate(req('classify'));

    expect(parse.mock.calls[0][0]).toMatchObject({
      model: 'claude-opus-5-5', betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'medium' },
    });
    expect(parse.mock.calls[1][0]).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low' } });
    expect(parse.mock.calls[1][0]).not.toHaveProperty('fallbacks');
  });

  it('stops with a plain message on a refusal', async () => {
    const { client } = mockClient({ stop_reason: 'refusal', parsed_output: null });
    await expect(new ClaudeAiClient(client).generate(req('classify'))).rejects.toBeInstanceOf(AiRefusalError);
  });

  it('retries once when the output fails our checks, then gives up', async () => {
    const bad = { stop_reason: 'end_turn', parsed_output: { ...FAKE_CLASSIFY, documentDate: 'Oct 5' } };
    const { client, parse } = mockClient(bad, { stop_reason: 'end_turn', parsed_output: FAKE_CLASSIFY });
    await expect(new ClaudeAiClient(client).generate(req('classify'))).resolves.toEqual(FAKE_CLASSIFY);
    expect(parse).toHaveBeenCalledTimes(2);

    const { client: c2 } = mockClient(bad, bad);
    await expect(new ClaudeAiClient(c2).generate(req('classify'))).rejects.toBeInstanceOf(AiOutputError);
  });

  it('treats a cut-off answer as a failure', async () => {
    const cut = { stop_reason: 'max_tokens', parsed_output: null };
    const { client } = mockClient(cut, cut);
    await expect(new ClaudeAiClient(client).generate(req('classify'))).rejects.toBeInstanceOf(AiOutputError);
  });
});
