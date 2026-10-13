/**
 * Token accounting from the provider's own numbers.
 *
 * The product rule (plan 1.1) is that displayed usage comes from the provider's
 * `usage` field, never from a local estimate. That makes this the only source of
 * numbers the UI may show, and it has to cope with the shapes providers actually
 * send: the AI SDK normalises most of it, but the details differ per provider and
 * older builds used `promptTokens` / `completionTokens`.
 *
 * Unknown values are `undefined` (newer SDKs) or `-1` (older ones, meaning "not
 * reported"). Both are dropped instead of being displayed as a number: a wrong
 * token count is worse than no token count, because the user cannot tell.
 */

export interface NormalizedUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** A usable count: finite, not negative (drops the legacy `-1` sentinel), whole. */
function tokenCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.trunc(value);
}

function firstDefined(...values: (number | undefined)[]): number | undefined {
  return values.find((value) => value !== undefined);
}

/**
 * Normalise one usage object. Returns `undefined` when nothing usable is present,
 * so callers can distinguish "the provider did not report usage" from "it
 * reported zero" — those mean different things to the user (plan 4.3 decision 1
 * is about the former).
 */
export function normalizeUsage(usage: unknown): NormalizedUsage | undefined {
  const record = asRecord(usage);
  if (!record) return undefined;

  const inputDetails = asRecord(record['inputTokenDetails']);
  const outputDetails = asRecord(record['outputTokenDetails']);

  const inputTokens = firstDefined(
    tokenCount(record['inputTokens']),
    tokenCount(record['promptTokens']),
  );
  const outputTokens = firstDefined(
    tokenCount(record['outputTokens']),
    tokenCount(record['completionTokens']),
  );
  const totalTokens = firstDefined(
    tokenCount(record['totalTokens']),
    inputTokens !== undefined && outputTokens !== undefined
      ? inputTokens + outputTokens
      : undefined,
  );
  const cachedInputTokens = firstDefined(
    inputDetails ? tokenCount(inputDetails['cacheReadTokens']) : undefined,
    tokenCount(record['cachedInputTokens']),
  );
  const reasoningTokens = firstDefined(
    outputDetails ? tokenCount(outputDetails['reasoningTokens']) : undefined,
    tokenCount(record['reasoningTokens']),
  );

  const result: NormalizedUsage = {};
  if (inputTokens !== undefined) result.inputTokens = inputTokens;
  if (outputTokens !== undefined) result.outputTokens = outputTokens;
  if (totalTokens !== undefined) result.totalTokens = totalTokens;
  if (cachedInputTokens !== undefined) result.cachedInputTokens = cachedInputTokens;
  if (reasoningTokens !== undefined) result.reasoningTokens = reasoningTokens;

  return Object.keys(result).length > 0 ? result : undefined;
}
