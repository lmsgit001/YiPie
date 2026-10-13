import { describe, expect, it } from 'vitest';

import {
  classifyModelConfigRows,
  createEmptyModelConfigsView,
  ModelConfig,
  ModelConfigPatch,
  ModelConfigsRecord,
  MODEL_CONFIGS_VERSION,
  toStoredRows,
} from '@/contract';

const baseInput = {
  id: 'm1',
  name: '本地 Ollama',
  baseURL: 'http://localhost:11434/v1',
  modelId: 'llama3.2',
};

describe('ModelConfig schema', () => {
  it('fills provider defaults without inventing an API key', () => {
    expect(ModelConfig.parse(baseInput)).toEqual({
      ...baseInput,
      providerId: 'openai-compatible',
      apiKey: '',
      headers: {},
      extraBody: {},
    });
  });

  it('strips unknown keys instead of persisting them', () => {
    expect(ModelConfig.parse({ ...baseInput, legacyField: 1 })).not.toHaveProperty('legacyField');
  });

  it('rejects the shapes the UI could get wrong', () => {
    expect(ModelConfig.safeParse({ ...baseInput, id: '' }).success).toBe(false);
    expect(ModelConfig.safeParse({ ...baseInput, baseURL: '' }).success).toBe(false);
    expect(ModelConfig.safeParse({ ...baseInput, temperature: 'hot' }).success).toBe(false);
    expect(ModelConfig.safeParse({ ...baseInput, temperature: 3 }).success).toBe(false);
    expect(ModelConfig.safeParse({ ...baseInput, headers: { 'x-retries': 3 } }).success).toBe(
      false,
    );
  });

  it('rejects an envelope written by a different schema version', () => {
    const future = {
      version: MODEL_CONFIGS_VERSION + 1,
      data: { rows: [ModelConfig.parse(baseInput)] },
    };
    expect(ModelConfigsRecord.safeParse(future).success).toBe(false);
  });
});

describe('ModelConfigPatch', () => {
  it('accepts an empty patch, so "save nothing" is not an error', () => {
    expect(ModelConfigPatch.parse({})).toEqual({});
  });

  it('carries no defaults, so a rename cannot reset the endpoint or the key', () => {
    const patch = ModelConfigPatch.parse({ name: '新名字' });
    expect(patch).toEqual({ name: '新名字' });
    expect(patch).not.toHaveProperty('baseURL');
    expect(patch).not.toHaveProperty('apiKey');
    expect(patch).not.toHaveProperty('headers');
  });
});

describe('model config rows', () => {
  it('is empty when there is nothing stored', () => {
    expect(createEmptyModelConfigsView()).toEqual({ models: [], unrecognized: [] });
  });

  it('keeps a row it does not understand instead of dropping it', () => {
    const view = classifyModelConfigRows([ModelConfig.parse(baseInput), { foo: 1 }]);

    expect(view.models).toHaveLength(1);
    expect(view.unrecognized).toEqual([{ foo: 1 }]);
  });

  it('sets aside a row that is ours except for one unreadable field', () => {
    // The row is recognisably a model config, but not one this build can read.
    // Rewriting it as a repair would be exactly the "cleaning function" that
    // deleted the previous project's records; keeping it whole is the contract.
    const view = classifyModelConfigRows([{ ...baseInput, temperature: 'hot' }]);

    expect(view.models).toEqual([]);
    expect(view.unrecognized).toEqual([{ ...baseInput, temperature: 'hot' }]);
  });

  it('round-trips every row, recognised or not, through a write', () => {
    const view = classifyModelConfigRows([
      ModelConfig.parse(baseInput),
      { foo: 1 },
      42,
      null,
      'not-a-row',
    ]);

    const afterWrite = classifyModelConfigRows(toStoredRows(view));

    expect(afterWrite.models).toEqual(view.models);
    expect(afterWrite.unrecognized).toEqual([{ foo: 1 }, 42, null, 'not-a-row']);
  });
});
