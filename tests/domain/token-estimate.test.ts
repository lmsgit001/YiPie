import { describe, expect, it } from 'vitest';

import { computeTokenBudget, estimateTokens } from '@/domain/token-estimate';

describe('estimateTokens', () => {
  it('returns zero for empty input', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('never under-estimates relative to a 4-chars-per-token guess', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
    expect(estimateTokens(text)).toBeGreaterThan(text.length / 4);
  });

  it('counts CJK characters far above the latin ratio', () => {
    const cjk = '这是一段中文正文'.repeat(10);
    expect(estimateTokens(cjk)).toBeGreaterThan(cjk.length * 0.9);
  });

  it('counts a non-BMP character once, not twice', () => {
    // 100 emoji are 100 code points but 200 UTF-16 units. A `for (i < length)`
    // loop sees 200 and reports ~54; iterating code points reports ~27.
    expect(estimateTokens('🙂'.repeat(100))).toBeLessThan(40);
  });
});

describe('computeTokenBudget', () => {
  it('subtracts the output reserve and the prompt overhead', () => {
    expect(computeTokenBudget(128_000, 500, 1024)).toEqual({
      inputTokenLimit: 128_000,
      reservedOutputTokens: 1024,
      overheadTokens: 500,
      pageTextBudget: 126_476,
    });
  });

  it('reports zero rather than a negative budget when the prompt alone fills the window', () => {
    expect(computeTokenBudget(2000, 1500, 1024).pageTextBudget).toBe(0);
  });
});
