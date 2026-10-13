import {
  createOpenAICompatible,
  type OpenAICompatibleProviderSettings,
} from '@ai-sdk/openai-compatible';
import { defaultSettingsMiddleware, wrapLanguageModel, type LanguageModel } from 'ai';

import { normalizeBaseURL, parseBaseURL } from '@/domain/model/base-url';
import { redactSecrets } from '@/domain/model/errors';
import { createLogger } from '@/platform/logger';

import type { ModelConfig } from '@/contract';

/**
 * One model config in, one callable model out.
 *
 * v1 has a single wire protocol (OQ-7): `providerId: 'ollama'` is served by the
 * same OpenAI-compatible client, it only changes how the base URL is normalised.
 * There is no per-provider package to keep in step, and no way for a provider to
 * be advertised in the UI without working here.
 *
 * Two things are deliberately *not* done here:
 *
 *  - **No global `fetch` patching.** The SDK's own `transformRequestBody` hook
 *    injects `extraBody`, so nothing else in the extension (or in another
 *    library) sees a rewritten `fetch`.
 *  - **No retries.** Failure classification lives in `domain/model/errors.ts` and
 *    the single retry is the caller's decision, made where the user can see that
 *    it happened.
 */

const logger = createLogger('model-provider');

/** Ollama ignores the key but the client requires a non-empty one. */
const OLLAMA_PLACEHOLDER_KEY = 'ollama';

/**
 * Call settings every summarise call is required to spread.
 *
 * `maxRetries: 1` — one retry, not the SDK's default of two (three attempts).
 * Plan 4.3 decision 4 allows a single retry for a transient failure; a longer
 * budget burns the user's rate limit on a request that already proved it fails,
 * and turns a clear error into a slow one.
 */
export const MODEL_CALL_SETTINGS = { maxRetries: 1 } as const;

/**
 * Request body keys the protocol owns. `extraBody` is the user's own JSON and is
 * merged over the body we build — which is what makes it useful for fields the
 * SDK does not know about (`reasoning_effort`, `top_k`, …) and for overriding
 * the ones it does — but letting it rewrite these four would break streaming or
 * rename the conversation, so they are filtered out.
 */
const PROTECTED_BODY_KEYS = new Set(['messages', 'model', 'stream', 'stream_options']);

/**
 * An HTTP header value has to survive a latin-1 round trip — the fetch
 * implementation converts it with `new Headers()`, which throws a ByteString
 * error on anything else. That throw happens deep inside the SDK and names
 * neither the header nor the config, so a value it cannot carry is filtered out
 * here with a log line instead of being sent.
 *
 * CR and LF are outside the allowed range too, which is what keeps a stored
 * header from injecting a second one.
 */
const SAFE_HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]*$/;

/**
 * Headers the SDK will send. The contract already types values as strings; this
 * re-checks anyway because imported files and stored rows are not guaranteed to
 * have passed through it, and a non-string header would be sent as `[object
 * Object]`.
 */
export function buildProviderHeaders(headers: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.trim();
    if (!name) continue;

    if (typeof value !== 'string') {
      logger.warn(`ignoring header "${name}": its value is not a string`);
      continue;
    }

    if (!SAFE_HEADER_VALUE.test(value)) {
      logger.warn(`ignoring header "${name}": its value has characters HTTP headers cannot carry`);
      continue;
    }

    result[name] = value;
  }

  return result;
}

/** The user's `extraBody`, minus the keys the protocol owns. */
export function buildBodyOverrides(extraBody: Record<string, unknown>): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(extraBody)) {
    if (PROTECTED_BODY_KEYS.has(key)) continue;
    overrides[key] = value;
  }

  return overrides;
}

/**
 * Build the client for a config.
 *
 * Throws when the base URL is not an absolute http(s) URL: the alternative is a
 * request to a relative path against the extension's own origin, which fails
 * with a 404 that says nothing about the actual mistake.
 */
export function createLanguageModelFromConfig(config: ModelConfig): LanguageModel {
  const parts = parseBaseURL(config.baseURL, config.providerId);

  if (!parts) {
    throw new Error(
      `Model "${config.id}" has an unusable base URL: ${redactSecrets(config.baseURL, [config.apiKey])}`,
    );
  }

  const isOllama = config.providerId === 'ollama';
  const headers = buildProviderHeaders(config.headers);
  const overrides = buildBodyOverrides(config.extraBody);
  // Normalisation happens when the client is built, never when a config is read:
  // a read path that writes is how the previous implementation lost data. The
  // stored value stays exactly as the user typed it.
  const baseURL = normalizeBaseURL(parts.href, config.providerId);

  // Assembled field by field rather than with `undefined` placeholders: with
  // `exactOptionalPropertyTypes` an explicit `undefined` is not the same as an
  // absent key, and the SDK reads `headers` / `fetch` as "did the caller supply
  // one" in a few places.
  const settings: OpenAICompatibleProviderSettings = {
    name: config.name || config.providerId,
    baseURL,
    // Asks the provider to include token counts in streaming responses; without
    // it a streamed answer has no usage to show (plan 1.1).
    includeUsage: true,
  };

  const apiKey = config.apiKey || (isOllama ? OLLAMA_PLACEHOLDER_KEY : '');
  if (apiKey) settings.apiKey = apiKey;
  if (Object.keys(headers).length > 0) settings.headers = headers;
  if (Object.keys(overrides).length > 0) {
    settings.transformRequestBody = (body) => ({ ...body, ...overrides });
  }

  const model = createOpenAICompatible(settings).chatModel(config.modelId);

  // The config's own sampling defaults, applied to every call rather than at one
  // call site: they describe the model, not the request. Absent fields are left
  // absent so the provider's default still applies — the middleware only fills
  // in what it is given.
  const callDefaults: Parameters<typeof defaultSettingsMiddleware>[0]['settings'] = {};
  if (config.temperature !== undefined) callDefaults.temperature = config.temperature;
  if (config.maxOutputTokens !== undefined) callDefaults.maxOutputTokens = config.maxOutputTokens;

  return Object.keys(callDefaults).length === 0
    ? model
    : wrapLanguageModel({
        model,
        middleware: defaultSettingsMiddleware({ settings: callDefaults }),
      });
}
