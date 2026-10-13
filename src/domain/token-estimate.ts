/**
 * Approximate token counting.
 *
 * The previous implementation shipped a 2.2MB BPE vocabulary inside the service
 * worker to count tokens exactly, and the worker had to parse all of it on cold
 * start. It was removed on purpose: the *pre-flight* need is only a budget that
 * avoids `context_length_exceeded`, and a conservative over-estimate is fine
 * there. The *displayed* number now comes from the provider's own `usage` after
 * the stream finishes, which is exact and free.
 *
 * So: over-estimate deliberately. Being a few tokens pessimistic costs a little
 * context; being optimistic costs a failed request.
 */

/** Roughly one token per CJK character, but never below the true count. */
const CJK_RATIO = 1;
/** Latin text runs about 4 characters per token. */
const LATIN_CHARS_PER_TOKEN = 4;
/** Safety margin applied to the whole estimate. */
const SAFETY_FACTOR = 1.08;
/** Never report zero for non-empty text: a request is at least one token. */
const MIN_FOR_NON_EMPTY = 1;

const CJK_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/u;

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;

  let cjk = 0;
  let other = 0;

  // Iterating code points (not UTF-16 units) keeps surrogate pairs — emoji,
  // rare CJK — counted once instead of once per half.
  for (const char of text) {
    if (CJK_RE.test(char)) cjk += 1;
    else other += 1;
  }

  const estimate = cjk * CJK_RATIO + other / LATIN_CHARS_PER_TOKEN;
  return Math.max(MIN_FOR_NON_EMPTY, Math.ceil(estimate * SAFETY_FACTOR));
}

export type TokenBudget = {
  inputTokenLimit: number;
  reservedOutputTokens: number;
  overheadTokens: number;
  /** What is left for the page text, or 0 when the prompt alone fills the window. */
  pageTextBudget: number;
};

/**
 * Split a model's context window into "prompt overhead", "reserved answer" and
 * "page text". `pageTextBudget === 0` is a distinct, reportable state: the
 * template and the output reserve already fill the window, so no amount of
 * truncation can make the request valid.
 */
export function computeTokenBudget(
  inputTokenLimit: number,
  overheadTokens: number,
  reservedOutputTokens = 1024,
): TokenBudget {
  const pageTextBudget = Math.max(0, inputTokenLimit - reservedOutputTokens - overheadTokens);

  return { inputTokenLimit, reservedOutputTokens, overheadTokens, pageTextBudget };
}
