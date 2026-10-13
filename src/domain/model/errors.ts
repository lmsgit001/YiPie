/**
 * Turning whatever a failed model call threw into something we can act on and
 * show. Two rules shape this file:
 *
 *  - **No retry storms.** Only the genuinely transient classes are marked
 *    retryable (rate limit, server, network, timeout), and the caller retries at
 *    most once. An auth failure is never retried; retrying a wrong API key just
 *    burns rate limit and hides the real message.
 *  - **Credentials never leave this file unredacted.** Redaction lives next to
 *    the error mapping so there is exactly one implementation: a second one
 *    added elsewhere would drift and leak.
 *
 * Nothing here imports the AI SDK. Errors are duck-typed from the few fields
 * that actually carry meaning (`statusCode`, `name`, `code`, `cause`,
 * `responseBody`), which keeps this module pure enough to test with plain
 * objects and keeps the SDK out of `domain/`.
 *
 * There are no user-facing strings: the UI owns its wording, and phase 6
 * translates it. Callers switch on `kind` (OQ-3, same decision the transfer
 * notices make).
 */

export const MODEL_ERROR_KINDS = [
  /** The caller aborted the request (user closed the panel, a newer run started). */
  'aborted',
  /** 401 / 403 — a wrong, missing or revoked key. */
  'auth',
  /** 402 — the account is out of credit. */
  'quota',
  /** 400 / 404 / 405 / 409 — the endpoint or the request shape is wrong. */
  'bad-request',
  /** Offline, DNS failure, refused connection, TLS problem. */
  'network',
  /** 429 — too many requests. */
  'rate-limit',
  /** 5xx — the provider's side. */
  'server',
  /** 408 / 504 / an explicit timeout. */
  'timeout',
  /** The input did not fit the model's context window. */
  'too-long',
  'unknown',
] as const;

export type ModelErrorKind = (typeof MODEL_ERROR_KINDS)[number];

const RETRYABLE: Record<ModelErrorKind, boolean> = {
  aborted: false,
  auth: false,
  quota: false,
  'bad-request': false,
  network: true,
  'rate-limit': true,
  server: true,
  timeout: true,
  // Retrying the same oversized payload cannot succeed; the caller trims and
  // starts a new attempt instead (plan 4.4).
  'too-long': false,
  unknown: false,
};

export interface ClassifiedModelError {
  kind: ModelErrorKind;
  /** Whether a single immediate retry is worth it. See the table above. */
  retryable: boolean;
  /** HTTP status when the failure had one. */
  status?: number;
  /** The provider's own wording where available, truncated and redacted. */
  message: string;
  /** Redacted response body, for the log line — never shown as the summary. */
  detail?: string;
}

export interface ClassifyOptions {
  /**
   * Values to strip from any text that ends up in `message` / `detail`. Pass the
   * config's API key; header values are safe to pass too.
   */
  secrets?: readonly (string | undefined)[];
  /** Truncation for `message` (provider errors can echo the whole prompt). */
  maxMessageLength?: number;
  maxDetailLength?: number;
}

const REDACTED = '[redacted]';
const DEFAULT_MAX_MESSAGE = 300;
const DEFAULT_MAX_DETAIL = 1200;
const MAX_CAUSE_DEPTH = 6;

const NETWORK_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ERR_NETWORK',
  'ERR_SSL_PROTOCOL_ERROR',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const TIMEOUT_CODES = new Set([
  'ETIMEDOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
]);

/**
 * The same two families again, matched against the text.
 *
 * The AI SDK wraps a failed attempt in a `RetryError` whose message keeps the
 * original wording ("Cannot connect to API: connect ECONNREFUSED
 * 127.0.0.1:8999"), and not every wrapper keeps a machine-readable `code`.
 * Without this, a refused connection was reported as `unknown` — the user would
 * have been told nothing at all about a problem they can fix.
 */
const NETWORK_EVIDENCE =
  /\b(?:EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|ENOTFOUND|EPIPE|ERR_NETWORK|ERR_SSL_PROTOCOL_ERROR|ERR_TLS_CERT_ALTNAME_INVALID|ERR_INVALID_URL)\b|failed to fetch|fetch failed|network error|load failed|socket hang up|connection (?:refused|reset|error|closed)/i;

const TIMEOUT_EVIDENCE = /\bETIMEDOUT\b|\bUND_ERR_[A-Z_]*TIMEOUT\b|timed out|timeout/i;

/** Wording providers use when the request did not fit the context window. */
const TOO_LONG_PATTERN =
  /context (?:length|window)|maximum context|too many tokens|token limit|prompt is too long|input (?:is too long|length)|reduce the length|string_above_max_length|exceeds the maximum/i;

const TOO_LONG_CODES = new Set([
  'context_length_exceeded',
  'string_above_max_length',
  'input_too_long',
]);

/** Used when the failure carried no message at all (a bare rejection). */
const FALLBACK_MESSAGE = 'The model request failed';

/**
 * Strip anything that looks like a credential.
 *
 * Known secrets are matched first and by value (only values long enough to be a
 * key — replacing every occurrence of a short string would mangle the message).
 * The patterns after that catch keys this process never saw, such as a second
 * config's key echoed back in an error body.
 */
export function redactSecrets(text: string, secrets: readonly (string | undefined)[] = []): string {
  let output = text;

  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length < 6) continue;
    output = output.split(secret).join(REDACTED);
  }

  return output
    .replace(/(Bearer\s+)[\w.~+/=-]{6,}/gi, `$1${REDACTED}`)
    .replace(/\bsk-[\w-]{6,}/g, `sk-${REDACTED}`)
    .replace(/([?&](?:api[_-]?key|key|token|access_token)=)[^&\s"']+/gi, `$1${REDACTED}`)
    .replace(
      /("(?:api[_-]?key|apiKey|token|secret|authorization)"\s*:\s*")[^"]+/gi,
      `$1${REDACTED}`,
    );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Walk the error graph. The interesting fields are rarely on the object the
 * caller caught: node puts the errno on the innermost `cause`, and the AI SDK's
 * `RetryError` hides the failing attempt in `lastError` (with every attempt in
 * `errors`), not in `cause`.
 */
function walkCauses(error: unknown): Record<string, unknown>[] {
  const chain: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];

  while (queue.length > 0 && chain.length < MAX_CAUSE_DEPTH) {
    const current = queue.shift();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);

    const record = asRecord(current);
    if (!record) continue;
    chain.push(record);

    const attempts = record['errors'];
    const lastAttempt = Array.isArray(attempts)
      ? (attempts[attempts.length - 1] as unknown)
      : undefined;

    // `lastError` first: it is the attempt that actually produced the message.
    queue.push(record['lastError'], lastAttempt, record['cause']);
  }

  return chain;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value ? value : undefined;
}

function firstStatus(chain: readonly Record<string, unknown>[]): number | undefined {
  for (const record of chain) {
    const status = readNumber(record, 'statusCode') ?? readNumber(record, 'status');
    if (status !== undefined) return status;
  }
  return undefined;
}

function firstErrorCode(chain: readonly Record<string, unknown>[]): string | undefined {
  for (const record of chain) {
    const code = readString(record, 'code');
    if (code) return code;
  }
  return undefined;
}

function firstErrorName(chain: readonly Record<string, unknown>[]): string | undefined {
  for (const record of chain) {
    const name = readString(record, 'name');
    if (name) return name;
  }
  return undefined;
}

function firstMessage(chain: readonly Record<string, unknown>[]): string | undefined {
  for (const record of chain) {
    const message = readString(record, 'message');
    if (message) return message;
  }
  return undefined;
}

/** The provider's own wording, which is more useful than "the request failed". */
function extractProviderMessage(responseBody: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return undefined;
  }

  const root = asRecord(parsed);
  if (!root) return undefined;

  const nested = asRecord(root['error']);
  const candidates = [
    nested ? readString(nested, 'message') : undefined,
    readString(root, 'message'),
    typeof root['error'] === 'string' ? root['error'] : undefined,
    nested ? readString(nested, 'type') : undefined,
  ];

  return candidates.find((candidate) => candidate !== undefined);
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}

function classify(
  chain: readonly Record<string, unknown>[],
  status: number | undefined,
  evidence: string,
): ModelErrorKind {
  const name = firstErrorName(chain);
  const code = firstErrorCode(chain);

  // Abort first: a cancelled request can carry a status-less fetch TypeError as
  // its cause, and reporting that as "network" would tell the user to check
  // their connection when they simply stopped it.
  if (name === 'AbortError' || code === 'ABORT_ERR') return 'aborted';

  if (status !== undefined) {
    if (status === 401 || status === 403) return 'auth';
    if (status === 402) return 'quota';
    if (status === 429) return 'rate-limit';
    if (status === 408 || status === 504) return 'timeout';
    if (status >= 500) return 'server';
    // 413 is "this payload was too large" by definition, so it needs no wording
    // to confirm; 400 and 422 are only *sometimes* about length.
    if (status === 413) return 'too-long';
    if (status >= 400) return TOO_LONG_PATTERN.test(evidence) ? 'too-long' : 'bad-request';

    return 'unknown';
  }

  if (name === 'TimeoutError' || (code !== undefined && TIMEOUT_CODES.has(code))) return 'timeout';
  if (code !== undefined && NETWORK_CODES.has(code)) return 'network';
  if (name === 'TypeError' && /fetch|network|load failed|connection/i.test(evidence))
    return 'network';
  // Timeout wording is checked before network wording: a connect timeout carries
  // both ("connect" and "timeout") and the timeout is the more precise report.
  if (TIMEOUT_EVIDENCE.test(evidence)) return 'timeout';
  if (NETWORK_EVIDENCE.test(evidence)) return 'network';
  if (TOO_LONG_PATTERN.test(evidence) || (code !== undefined && TOO_LONG_CODES.has(code)))
    return 'too-long';

  return 'unknown';
}

export function classifyModelError(
  error: unknown,
  options: ClassifyOptions = {},
): ClassifiedModelError {
  const chain = walkCauses(error);
  const status = firstStatus(chain);
  const responseBody =
    chain.map((record) => readString(record, 'responseBody')).find(Boolean) ?? '';
  const providerMessage = extractProviderMessage(responseBody);

  const secrets = options.secrets ?? [];
  const rawMessage = providerMessage ?? firstMessage(chain) ?? FALLBACK_MESSAGE;
  const message = truncate(
    redactSecrets(rawMessage, secrets),
    options.maxMessageLength ?? DEFAULT_MAX_MESSAGE,
  );
  const kind = classify(chain, status, `${rawMessage}\n${responseBody}`);

  const result: ClassifiedModelError = {
    kind,
    retryable: RETRYABLE[kind],
    message,
  };

  if (status !== undefined) result.status = status;

  if (responseBody) {
    result.detail = truncate(
      redactSecrets(responseBody, secrets),
      options.maxDetailLength ?? DEFAULT_MAX_DETAIL,
    );
  }

  return result;
}
