import { describe, expect, it } from 'vitest';

import { extractPromptVariables, findUnknownPromptVariables } from '@/domain/prompt/template';

describe('prompt template variables', () => {
  it('extracts names, deduplicated and sorted', () => {
    expect(
      extractPromptVariables('{{textContent}} and {{ articleUrl }} then {{textContent}}'),
    ).toEqual(['articleUrl', 'textContent']);
  });

  it('leaves anything that is not a placeholder alone', () => {
    // A section marker is not a variable: OQ-4 keeps the subset at "replace a
    // name", so `{{#items}}` has no meaning to attach to and stays literal
    // text. Only the plain name inside is extracted.
    expect(extractPromptVariables('{{#items}}{{name}}{{/items}}')).toEqual(['name']);
    expect(extractPromptVariables('{ not a placeholder }')).toEqual([]);
    expect(extractPromptVariables('{{1startsWithDigit}}')).toEqual([]);
  });

  it('reports only the names this build cannot fill', () => {
    const template = '{{textContent}} {{pageTitle}} {{articleUrl}}';

    expect(findUnknownPromptVariables(template, ['articleUrl', 'textContent'])).toEqual([
      'pageTitle',
    ]);
    expect(
      findUnknownPromptVariables(template, ['articleUrl', 'pageTitle', 'textContent']),
    ).toEqual([]);
  });
});
