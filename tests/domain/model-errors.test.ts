import { describe, expect, it } from 'vitest';

import { classifyModelError, redactSecrets } from '@/domain/model/errors';

/** Shaped like the AI SDK's `APICallError`, which is all the classifier reads. */
function apiError(statusCode: number, responseBody: string, message = 'request failed') {
  return { name: 'AI_APICallError', message, statusCode, responseBody, url: 'https://example.com' };
}

describe('classifyModelError', () => {
  it('maps each HTTP family to its own kind', () => {
    expect(classifyModelError(apiError(401, '')).kind).toBe('auth');
    expect(classifyModelError(apiError(403, '')).kind).toBe('auth');
    expect(classifyModelError(apiError(402, '')).kind).toBe('quota');
    expect(classifyModelError(apiError(429, '')).kind).toBe('rate-limit');
    expect(classifyModelError(apiError(408, '')).kind).toBe('timeout');
    expect(classifyModelError(apiError(500, '')).kind).toBe('server');
    expect(classifyModelError(apiError(503, '')).kind).toBe('server');
    expect(classifyModelError(apiError(404, '')).kind).toBe('bad-request');
    expect(classifyModelError(apiError(400, '')).kind).toBe('bad-request');
  });

  it('recognises a context-window refusal even when it arrives as 400 or 413', () => {
    const body = JSON.stringify({
      error: {
        message: "This model's maximum context length is 8192 tokens",
        type: 'invalid_request_error',
      },
    });

    expect(classifyModelError(apiError(400, body)).kind).toBe('too-long');
    expect(classifyModelError(apiError(413, '')).kind).toBe('too-long');
    expect(
      classifyModelError({ name: 'AI_APICallError', message: 'input is too long', statusCode: 422 })
        .kind,
    ).toBe('too-long');
  });

  it('marks only the transient kinds as retryable', () => {
    expect(classifyModelError(apiError(429, '')).retryable).toBe(true);
    expect(classifyModelError(apiError(500, '')).retryable).toBe(true);
    expect(classifyModelError({ name: 'TypeError', message: 'fetch failed' }).retryable).toBe(true);
    expect(classifyModelError({ name: 'TimeoutError', message: 'timed out' }).retryable).toBe(true);

    expect(classifyModelError(apiError(401, '')).retryable).toBe(false);
    expect(classifyModelError(apiError(402, '')).retryable).toBe(false);
    expect(classifyModelError(apiError(404, '')).retryable).toBe(false);
    expect(classifyModelError({ name: 'AbortError', message: 'aborted' }).retryable).toBe(false);
    expect(classifyModelError(new Error('something else')).retryable).toBe(false);
  });

  it('reads errno codes and names off the cause chain', () => {
    const network = { name: 'TypeError', message: 'fetch failed', cause: { code: 'ECONNREFUSED' } };
    expect(classifyModelError(network).kind).toBe('network');

    const dns = new Error('request failed', { cause: { code: 'ENOTFOUND' } });
    expect(classifyModelError(dns).kind).toBe('network');

    const timeout = { message: 'request timed out', cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } };
    expect(classifyModelError(timeout).kind).toBe('timeout');

    // Aborted wins over the fetch TypeError that fetch failures are wrapped in.
    const aborted = {
      name: 'AbortError',
      message: 'The operation was aborted',
      cause: { code: 'ABORT_ERR' },
    };
    expect(classifyModelError(aborted).kind).toBe('aborted');
  });

  it('unwraps the SDK’s retry wrapper instead of giving up on it', () => {
    // Exactly what a refused connection looked like in the live probe: the
    // wrapper's message is all there is, and `cause` does not exist.
    const refused = {
      name: 'AI_RetryError',
      message:
        'Failed after 3 attempts. Last error: Cannot connect to API: connect ECONNREFUSED 127.0.0.1:8999',
      lastError: {
        name: 'TypeError',
        message: 'Cannot connect to API: connect ECONNREFUSED 127.0.0.1:8999',
        cause: { code: 'ECONNREFUSED' },
      },
      errors: [{ name: 'TypeError', message: 'fetch failed' }],
    };

    const classified = classifyModelError(refused);
    expect(classified.kind).toBe('network');
    expect(classified.retryable).toBe(true);
  });

  it('keeps the status of the last attempt when the wrapper has no status of its own', () => {
    const retried = {
      name: 'AI_RetryError',
      message: 'Failed after 3 attempts. Last error: Too Many Requests',
      lastError: { name: 'AI_APICallError', statusCode: 429, responseBody: '{}' },
    };

    expect(classifyModelError(retried)).toMatchObject({ kind: 'rate-limit', status: 429 });
  });

  it('tells a connect timeout apart from a refused connection', () => {
    expect(
      classifyModelError({ message: 'Cannot connect to API: connect timeout of 30000ms exceeded' })
        .kind,
    ).toBe('timeout');
    expect(classifyModelError({ code: 'UND_ERR_CONNECT_TIMEOUT', message: 'x' }).kind).toBe(
      'timeout',
    );
  });

  it('prefers the provider’s own wording over the transport message', () => {
    const classified = classifyModelError(
      apiError(
        401,
        JSON.stringify({ error: { message: 'Incorrect API key provided: sk-abc***' } }),
        'Bad Request',
      ),
    );

    expect(classified.message).toContain('Incorrect API key');
    expect(classified.status).toBe(401);
    expect(classified.detail).toContain('Incorrect API key');
  });

  it('never returns an empty message and never throws on junk', () => {
    for (const junk of [undefined, null, 'boom', 42, {}, { name: 'Weird' }]) {
      const classified = classifyModelError(junk);
      expect(classified.kind).toBe('unknown');
      expect(classified.message.length).toBeGreaterThan(0);
      expect(classified.status).toBeUndefined();
      expect(classified.detail).toBeUndefined();
    }
  });

  it('truncates a body that echoes the whole prompt', () => {
    const classified = classifyModelError(apiError(500, 'x'.repeat(5000)));
    expect(classified.message.length).toBeLessThanOrEqual(301);
    expect(classified.detail?.length).toBeLessThanOrEqual(1201);
  });

  it('redacts secrets it is told about, plus key-shaped strings it is not', () => {
    const key = 'sk-live-abcdefghijklmnop';
    const classified = classifyModelError(
      apiError(401, JSON.stringify({ error: { message: `bad key ${key}` } })),
      { secrets: [key] },
    );

    expect(classified.message).not.toContain(key);
    expect(classified.message).toContain('[redacted]');
  });
});

describe('redactSecrets', () => {
  it('replaces known secrets and standard credential shapes', () => {
    expect(redactSecrets('token=supersecretvalue', ['supersecretvalue'])).toBe('token=[redacted]');
    expect(redactSecrets('Authorization: Bearer abcdef123456')).toBe(
      'Authorization: Bearer [redacted]',
    );
    expect(redactSecrets('using sk-1234567890abcdef now')).toBe('using sk-[redacted] now');
    expect(redactSecrets('GET https://x.io/v1?api_key=abcd1234efgh')).toBe(
      'GET https://x.io/v1?api_key=[redacted]',
    );
    expect(redactSecrets('{"apiKey":"abcd1234efgh"}')).toBe('{"apiKey":"[redacted]"}');
  });

  it('ignores values too short to be a key, so ordinary text survives', () => {
    expect(redactSecrets('the model is on', ['on'])).toBe('the model is on');
    expect(redactSecrets('nothing to hide')).toBe('nothing to hide');
  });
});
