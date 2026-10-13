import { describe, expect, it } from 'vitest';

import {
  classifyPromptConfigRows,
  DEFAULT_PROMPT_LIBRARY,
  PromptConfig,
  PromptConfigPatch,
  PromptConfigsRecord,
  PROMPT_CONFIGS_VERSION,
  PROMPT_VARIABLES,
  toStoredPromptConfigRows,
} from '@/contract';
import { findUnknownPromptVariables } from '@/domain/prompt/template';

const baseInput = {
  id: 'p1',
  name: '自定义',
  userTemplate: '{{textContent}}',
};

describe('PromptConfig schema', () => {
  it('fills the empty system template rather than leaving it undefined', () => {
    expect(PromptConfig.parse(baseInput)).toEqual({ ...baseInput, systemTemplate: '' });
  });

  it('requires a non-empty user template', () => {
    expect(PromptConfig.safeParse({ ...baseInput, userTemplate: '' }).success).toBe(false);
    expect(PromptConfig.safeParse({ ...baseInput, name: '' }).success).toBe(false);
  });

  it('keeps a template with an unknown variable readable', () => {
    // The schema stays permissive on purpose: a row written by a newer build
    // must not become an "unrecognised row" and vanish from the UI. The typo
    // check belongs to the editor (see the service tests).
    expect(PromptConfig.safeParse({ ...baseInput, userTemplate: '{{future}}' }).success).toBe(true);
  });

  it('rejects an envelope from another schema version', () => {
    expect(
      PromptConfigsRecord.safeParse({ version: PROMPT_CONFIGS_VERSION + 1, data: { rows: [] } })
        .success,
    ).toBe(false);
  });
});

describe('PromptConfigPatch', () => {
  it('accepts an empty patch with no defaults leaking in', () => {
    expect(PromptConfigPatch.parse({})).toEqual({});
    expect(PromptConfigPatch.parse({ name: 'x' })).not.toHaveProperty('userTemplate');
  });
});

describe('prompt config rows', () => {
  it('keeps a row it does not understand', () => {
    const view = classifyPromptConfigRows([PromptConfig.parse(baseInput), { foo: 1 }]);

    expect(view.prompts).toHaveLength(1);
    expect(view.unrecognized).toEqual([{ foo: 1 }]);
  });

  it('round-trips every row through a write', () => {
    const view = classifyPromptConfigRows([PromptConfig.parse(baseInput), 'not-a-row', 7]);
    const afterWrite = classifyPromptConfigRows(toStoredPromptConfigRows(view));

    expect(afterWrite.prompts).toEqual(view.prompts);
    expect(afterWrite.unrecognized).toEqual(['not-a-row', 7]);
  });
});

describe('the seeded prompt library', () => {
  it('is valid against its own schema', () => {
    for (const preset of DEFAULT_PROMPT_LIBRARY) {
      expect(PromptConfig.safeParse(preset).success).toBe(true);
    }
  });

  it('only uses variables this build provides', () => {
    for (const preset of DEFAULT_PROMPT_LIBRARY) {
      expect(findUnknownPromptVariables(preset.systemTemplate, PROMPT_VARIABLES)).toEqual([]);
      expect(findUnknownPromptVariables(preset.userTemplate, PROMPT_VARIABLES)).toEqual([]);
    }
  });

  it('has stable, unique ids', () => {
    const ids = DEFAULT_PROMPT_LIBRARY.map((preset) => preset.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
