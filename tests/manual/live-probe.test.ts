import { generateText } from 'ai';
import { describe, expect, it } from 'vitest';

import { ModelConfig } from '@/contract';
import { classifyModelError } from '@/domain/model/errors';
import { createLanguageModelFromConfig } from '@/platform/model/provider';
import { normalizeUsage } from '@/platform/model/usage';

/**
 * The one check no stub can make: a real request against a real endpoint, with
 * the user's own key. Stage 2's acceptance criteria ask for it (plan 4.3), and
 * it is why this file lives apart from the rest of the suite.
 *
 * It is skipped unless the environment is set up, so `npm run gate` and CI never
 * touch the network and never need a key. To run it by hand:
 *
 * ```sh
 * YIPIE_PROBE_BASE_URL=https://api.deepseek.com/v1 \
 * YIPIE_PROBE_MODEL=deepseek-chat \
 * YIPIE_PROBE_API_KEY=sk-… \
 * npx vitest run tests/manual/live-probe.test.ts
 *
 * # a local server needs no key:
 * YIPIE_PROBE_BASE_URL=http://localhost:11434/api YIPIE_PROBE_PROVIDER=ollama \
 *   YIPIE_PROBE_MODEL=qwen3:8b npx vitest run tests/manual/live-probe.test.ts
 * ```
 *
 * Nothing is written to disk and the key is never printed — only the kind of
 * failure, when there is one.
 */

const baseURL = process.env.YIPIE_PROBE_BASE_URL ?? '';
const apiKey = process.env.YIPIE_PROBE_API_KEY ?? '';
const modelId = process.env.YIPIE_PROBE_MODEL ?? '';
const providerId = process.env.YIPIE_PROBE_PROVIDER === 'ollama' ? 'ollama' : 'openai-compatible';

const configured = baseURL !== '' && modelId !== '';

describe.runIf(configured)('live provider probe', () => {
  it('gets an answer and reports usage from the provider', async () => {
    const config = ModelConfig.parse({
      id: 'live-probe',
      name: 'live probe',
      providerId,
      baseURL,
      apiKey,
      modelId,
    });

    const model = createLanguageModelFromConfig(config);

    try {
      const result = await generateText({
        model,
        prompt: 'Reply with the single word: pong',
        maxOutputTokens: 16,
        temperature: 0,
      });

      const usage = normalizeUsage(result.usage);
      console.log(`[probe] endpoint   : ${baseURL}`);
      console.log(`[probe] model      : ${modelId}`);
      console.log(`[probe] answer     : ${result.text.trim().slice(0, 200)}`);
      console.log(
        `[probe] usage      : ${usage ? JSON.stringify(usage) : 'the provider reported none'}`,
      );

      expect(result.text.trim().length).toBeGreaterThan(0);
    } catch (error) {
      const classified = classifyModelError(error, { secrets: [apiKey] });
      console.error(
        `[probe] failed     : ${classified.kind} (status ${classified.status ?? 'none'}, ` +
          `retryable ${String(classified.retryable)}): ${classified.message}`,
      );
      throw error;
    }
  }, 60_000);
});
