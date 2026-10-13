import { describe, expect, it } from 'vitest';

import { normalizeUsage } from '@/platform/model/usage';

describe('normalizeUsage', () => {
  it('reads the current AI SDK shape', () => {
    expect(
      normalizeUsage({
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
        inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 20, cacheWriteTokens: 0 },
        outputTokenDetails: { textTokens: 10, reasoningTokens: 20 },
      }),
    ).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      cachedInputTokens: 20,
      reasoningTokens: 20,
    });
  });

  it('reads the older prompt/completion names', () => {
    expect(normalizeUsage({ promptTokens: 5, completionTokens: 7, totalTokens: 12 })).toEqual({
      inputTokens: 5,
      outputTokens: 7,
      totalTokens: 12,
    });
  });

  it('adds up a total the provider did not send', () => {
    expect(normalizeUsage({ inputTokens: 10, outputTokens: 4 })).toEqual({
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
    });
  });

  it('drops unknown values instead of showing -1 or NaN', () => {
    expect(normalizeUsage({ inputTokens: -1, outputTokens: -1, totalTokens: -1 })).toBeUndefined();
    expect(normalizeUsage({ inputTokens: Number.NaN, outputTokens: 3 })).toEqual({
      outputTokens: 3,
    });
  });

  it('does not invent a total from half the numbers', () => {
    // A "total" that only counts one side looks authoritative and is wrong.
    expect(normalizeUsage({ outputTokens: 3 })).toEqual({ outputTokens: 3 });
    expect(normalizeUsage({ inputTokens: 9, cachedInputTokens: 4 })).toEqual({
      inputTokens: 9,
      cachedInputTokens: 4,
    });
  });

  it('reports nothing when the provider sent nothing', () => {
    expect(normalizeUsage({})).toBeUndefined();
    expect(normalizeUsage(undefined)).toBeUndefined();
    expect(normalizeUsage('150 tokens')).toBeUndefined();
    expect(normalizeUsage({ inputTokens: null })).toBeUndefined();
  });

  it('takes the deprecated top-level fields when the detail objects are absent', () => {
    expect(normalizeUsage({ inputTokens: 9, cachedInputTokens: 4, reasoningTokens: 2 })).toEqual({
      inputTokens: 9,
      cachedInputTokens: 4,
      reasoningTokens: 2,
    });
  });
});
