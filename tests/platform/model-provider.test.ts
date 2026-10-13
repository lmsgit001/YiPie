import { readFileSync } from 'node:fs';

import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelConfig, type ModelConfigInput } from '@/contract';
import {
  buildBodyOverrides,
  buildProviderHeaders,
  createLanguageModelFromConfig,
  MODEL_CALL_SETTINGS,
} from '@/platform/model/provider';
import { normalizeUsage } from '@/platform/model/usage';

/**
 * The provider is exercised through `generateText`, the same entry point the
 * summariser will use, with only the network stubbed. Asserting on the outgoing
 * request is the point: `extraBody` and `headers` are user-authored, and the
 * failure mode this guards against is a field silently not being sent.
 */
function config(overrides: Partial<ModelConfigInput> = {}) {
  return ModelConfig.parse({
    id: 'model-1',
    name: 'Test endpoint',
    providerId: 'openai-compatible',
    baseURL: 'https://api.example.com/v1',
    apiKey: 'sk-test-secret',
    modelId: 'test-model',
    ...overrides,
  });
}

/** The request body is always a JSON string here, so parse it rather than stringify it. */
function bodyOf(call: { init: RequestInit } | undefined): Record<string, unknown> {
  const body = call?.init.body;
  if (typeof body !== 'string') throw new Error('expected the request body to be a JSON string');
  return JSON.parse(body) as Record<string, unknown>;
}

function stubFetch() {
  const calls: { url: string; init: RequestInit }[] = [];

  const fetchStub = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: url instanceof Request ? url.url : String(url), init: init ?? {} });

    return Promise.resolve(
      new Response(
        JSON.stringify({
          id: 'chatcmpl-1',
          object: 'chat.completion',
          created: 0,
          model: 'test-model',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  });

  const original = globalThis.fetch;
  globalThis.fetch = fetchStub;

  return { calls, restore: () => (globalThis.fetch = original) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildProviderHeaders', () => {
  it('keeps string values and drops anything else', () => {
    expect(
      buildProviderHeaders({ 'X-Title': 'yipie', 'X-Count': 3, Nested: { a: 1 }, Empty: null }),
    ).toEqual({ 'X-Title': 'yipie' });
  });

  it('refuses values that could inject a second header line', () => {
    expect(buildProviderHeaders({ 'X-Trace': 'ok\r\nX-Evil: 1' })).toEqual({});
  });

  it('drops a value HTTP cannot carry instead of failing the whole request', () => {
    // `new Headers({ 'X-Title': '一瞥' })` throws a ByteString error inside the
    // SDK; the header is skipped so the call still goes out.
    expect(buildProviderHeaders({ 'X-Title': '一瞥', Accept: 'application/json' })).toEqual({
      Accept: 'application/json',
    });
  });
});

describe('buildBodyOverrides', () => {
  it('passes provider-specific fields through', () => {
    expect(buildBodyOverrides({ reasoning_effort: 'low', top_k: 40 })).toEqual({
      reasoning_effort: 'low',
      top_k: 40,
    });
  });

  it('never lets extraBody rewrite the protocol', () => {
    expect(
      buildBodyOverrides({
        model: 'someone-elses-model',
        messages: [],
        stream: false,
        stream_options: {},
        keep: true,
      }),
    ).toEqual({ keep: true });
  });
});

describe('createLanguageModelFromConfig', () => {
  it('sends the model, the key and the configured headers to /chat/completions', async () => {
    const { calls, restore } = stubFetch();

    try {
      const model = createLanguageModelFromConfig(config({ headers: { 'X-Title': 'yipie' } }));
      const result = await generateText({ model, prompt: 'summarise this' });

      expect(result.text).toBe('hello');
      expect(calls).toHaveLength(1);

      const call = calls[0];
      expect(call?.url).toBe('https://api.example.com/v1/chat/completions');

      // The SDK normalises headers through `Headers`, so keys arrive lowercase.
      const headers = call?.init.headers as Record<string, string>;
      expect(headers['authorization']).toBe('Bearer sk-test-secret');
      expect(headers['x-title']).toBe('yipie');

      const body = bodyOf(call);
      expect(body['model']).toBe('test-model');
      // generateText omits the flag entirely rather than sending `stream: false`.
      expect(body['stream']).toBeUndefined();
      expect(body['messages']).toEqual([{ role: 'user', content: 'summarise this' }]);

      // The provider's own numbers, not a local estimate (plan 1.1).
      // The SDK fills the detail fields with 0 when the provider reports no
      // cache / reasoning split, and 0 is a true statement about this response.
      expect(normalizeUsage(result.usage)).toEqual({
        inputTokens: 11,
        outputTokens: 4,
        totalTokens: 15,
        cachedInputTokens: 0,
        reasoningTokens: 0,
      });
    } finally {
      restore();
    }
  });

  it('merges extraBody into the request without disturbing the protocol', async () => {
    const { calls, restore } = stubFetch();

    try {
      const model = createLanguageModelFromConfig(
        config({
          extraBody: {
            reasoning_effort: 'low',
            thinking: { type: 'disabled' },
            model: 'evil',
            messages: [],
          },
        }),
      );

      await generateText({ model, prompt: 'hi' });

      const body = bodyOf(calls[0]);
      expect(body['reasoning_effort']).toBe('low');
      expect(body['thinking']).toEqual({ type: 'disabled' });
      expect(body['model']).toBe('test-model');
      expect(body['messages']).toEqual([{ role: 'user', content: 'hi' }]);
    } finally {
      restore();
    }
  });

  it('normalises the Ollama base URL and supplies the placeholder key', async () => {
    const { calls, restore } = stubFetch();

    try {
      const model = createLanguageModelFromConfig(
        config({ providerId: 'ollama', baseURL: 'http://localhost:11434/api', apiKey: '' }),
      );

      await generateText({ model, prompt: 'hi' });

      expect(calls[0]?.url).toBe('http://localhost:11434/v1/chat/completions');
      const headers = calls[0]?.init.headers as Record<string, string>;
      expect(headers['authorization']).toBe('Bearer ollama');
    } finally {
      restore();
    }
  });

  it('omits the Authorization header when there is no key', async () => {
    const { calls, restore } = stubFetch();

    try {
      await generateText({
        model: createLanguageModelFromConfig(config({ apiKey: '' })),
        prompt: 'hi',
      });

      const headers = calls[0]?.init.headers as Record<string, string>;
      expect(headers['authorization']).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('applies the config’s sampling defaults, unless the call overrides them', async () => {
    const { calls, restore } = stubFetch();

    try {
      const model = createLanguageModelFromConfig(
        config({ temperature: 0.2, maxOutputTokens: 64 }),
      );

      await generateText({ model, prompt: 'hi' });
      const first = bodyOf(calls[0]);
      expect(first['temperature']).toBe(0.2);
      expect(first['max_tokens']).toBe(64);

      await generateText({ model, prompt: 'hi', temperature: 0.9 });
      const second = bodyOf(calls[1]);
      expect(second['temperature']).toBe(0.9);
    } finally {
      restore();
    }
  });

  it('sends no sampling fields when the config leaves them unset', async () => {
    const { calls, restore } = stubFetch();

    try {
      await generateText({
        model: createLanguageModelFromConfig(config()),
        prompt: 'hi',
      });

      const body = bodyOf(calls[0]);
      expect(body['temperature']).toBeUndefined();
      expect(body['max_tokens']).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('retries a transient failure exactly once', async () => {
    const attempts: number[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = () => {
      attempts.push(attempts.length + 1);
      return Promise.resolve(
        new Response('{"error":{"message":"slow down"}}', {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '0' },
        }),
      );
    };

    try {
      await expect(
        generateText({
          model: createLanguageModelFromConfig(config()),
          prompt: 'hi',
          ...MODEL_CALL_SETTINGS,
        }),
      ).rejects.toThrow();

      // Two attempts, not the SDK's default three.
      expect(attempts).toHaveLength(2);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('refuses a base URL that is not an absolute http(s) URL', () => {
    expect(() => createLanguageModelFromConfig(config({ baseURL: 'api.example.com/v1' }))).toThrow(
      /unusable base URL/,
    );
  });

  it('does not leak the API key when the base URL it rejects contains one', () => {
    expect(() =>
      createLanguageModelFromConfig(
        config({ baseURL: 'https://api.example.com/v1', apiKey: 'sk-test-secret' }),
      ),
    ).not.toThrow();

    // A key smuggled into the URL itself must not reach the message.
    try {
      createLanguageModelFromConfig(
        config({ baseURL: `sk-test-secret`, apiKey: 'sk-test-secret' }),
      );
    } catch (error) {
      expect((error as Error).message).not.toContain('sk-test-secret');
    }
  });
});

/**
 * The AI SDK's provider spec is versioned separately from the package version:
 * `@ai-sdk/openai-compatible` 2.x speaks spec **v3**, which is what AI SDK 6
 * accepts. The previous project got this wrong the other way round — it relied on
 * a package that declared spec v1 and was rejected at runtime — so the version
 * pairing is pinned by a test rather than by a comment.
 */
describe('dependency pins', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { dependencies: Record<string, string> };

  it('locks the AI SDK packages to exact versions', () => {
    const sdkPackages = Object.keys(packageJson.dependencies).filter(
      (name) => name === 'ai' || name.startsWith('@ai-sdk/'),
    );

    expect(sdkPackages.length).toBeGreaterThan(0);
    for (const name of sdkPackages) {
      // A range would let a provider package move to a newer spec without the
      // `ai` version moving with it.
      expect(packageJson.dependencies[name]).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('produces a model the installed SDK accepts', () => {
    // `LanguageModel` is a union (it also accepts plain model-id strings), so the
    // spec marker has to be read through a cast.
    const model = createLanguageModelFromConfig(config()) as unknown as {
      specificationVersion?: string;
    };

    expect(['v2', 'v3']).toContain(model.specificationVersion);
  });
});
