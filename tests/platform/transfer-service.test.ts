import { describe, expect, it } from 'vitest';

import {
  MODEL_CONFIGS_STORAGE_KEY,
  MODEL_CONFIGS_VERSION,
  PROMPT_CONFIGS_STORAGE_KEY,
  type TransferFile,
} from '@/contract';
import { addModelConfig, loadModelConfigs } from '@/platform/settings/model-configs-service';
import { addPromptConfig, loadPromptConfigs } from '@/platform/settings/prompt-configs-service';
import { loadSelection, saveSelection } from '@/platform/settings/selection-service';
import {
  exportTransferConfig,
  importTransferConfig,
  previewTransferImport,
} from '@/platform/settings/transfer-service';

import { createMemoryStore, type MemoryStore } from '../helpers/memory-store';

const model = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id,
  baseURL: 'https://api.example.com/v1',
  modelId: 'gpt-4o-mini',
  ...overrides,
});

const prompt = (id: string) => ({ id, name: id, userTemplate: '{{textContent}}' });

async function seededStore(): Promise<MemoryStore> {
  const store = createMemoryStore();
  await addModelConfig(model('m1', { apiKey: 'sk-secret', headers: { 'x-key': 'v' } }), store);
  await addModelConfig(model('m2'), store);
  await addPromptConfig(prompt('p1'), store);
  await saveSelection({ defaultModelId: 'm1', defaultPromptId: 'p1' }, store);
  return store;
}

describe('exporting', () => {
  it('writes a file describing the stored configuration', async () => {
    const store = await seededStore();

    const file = await exportTransferConfig(store, { includeSecrets: false, appVersion: '0.1.0' });

    expect(file.appVersion).toBe('0.1.0');
    expect(Number.isNaN(Date.parse(file.exportedAt))).toBe(false);
    expect(file.models.map((entry) => entry.id)).toEqual(['m1', 'm2']);
    expect(file.selection).toMatchObject({ defaultModelId: 'm1' });
  });

  it('leaves credentials out unless asked', async () => {
    const store = await seededStore();

    const without = await exportTransferConfig(store, { includeSecrets: false });
    const withSecrets = await exportTransferConfig(store, { includeSecrets: true });

    expect(without.models[0]?.apiKey).toBe('');
    expect(without.models[0]?.headers).toEqual({});
    expect(withSecrets.models[0]).toMatchObject({ apiKey: 'sk-secret', headers: { 'x-key': 'v' } });
  });
});

describe('previewing an import', () => {
  it('adds the notice the contract cannot produce: unfillable variables', async () => {
    const store = createMemoryStore();
    const file: TransferFile = {
      ...(await exportTransferConfig(store, { includeSecrets: false })),
      prompts: [{ id: 'p1', name: 'p1', userTemplate: '{{pageTitle}}' }],
    };

    expect(previewTransferImport(file).notices).toEqual([
      { code: 'unknown-variables', names: ['pageTitle'] },
    ]);
  });
});

describe('importing', () => {
  it('round-trips a configuration into an empty store', async () => {
    const source = await seededStore();
    const file = await exportTransferConfig(source, {
      includeSecrets: true,
      appVersion: '0.1.0',
    });
    const target = createMemoryStore();

    const result = await importTransferConfig(file, target);

    expect(result.models.models.map((entry) => entry.id)).toEqual(['m1', 'm2']);
    expect(result.prompts.prompts.map((entry) => entry.id)).toEqual(['p1']);
    expect((await loadSelection(target)).defaultModelId).toBe('m1');
    // Credentials came along because the export carried them and the file asked
    // nothing more; the notice says so.
    expect(result.notices).toEqual([{ code: 'credentials-included', count: 1 }]);
    expect((await loadModelConfigs(target)).models[0]?.apiKey).toBe('sk-secret');
  });

  it('reports how many rows it skipped', async () => {
    const file: TransferFile = {
      ...(await exportTransferConfig(createMemoryStore(), { includeSecrets: false })),
      models: [model('m1'), { foo: 1 }, { foo: 2 }],
    };

    const result = await importTransferConfig(file, createMemoryStore());

    expect(result.models.models.map((entry) => entry.id)).toEqual(['m1']);
    expect(result.notices).toContainEqual({ code: 'models-skipped', count: 2 });
  });

  it('refuses a file whose rows are all unreadable, and writes nothing', async () => {
    const store = await seededStore();
    const before = { ...store.dump };
    const file: TransferFile = {
      ...(await exportTransferConfig(createMemoryStore(), { includeSecrets: false })),
      models: [{ foo: 1 }],
    };

    await expect(importTransferConfig(file, store)).rejects.toThrow(/None of the model/);
    // A partial or empty "successful" import is exactly what the rule prevents.
    expect(store.dump).toEqual(before);
    expect((await loadModelConfigs(store)).models.map((entry) => entry.id)).toEqual(['m1', 'm2']);
  });

  it('refuses duplicate ids instead of creating an ambiguous list', async () => {
    const file: TransferFile = {
      ...(await exportTransferConfig(createMemoryStore(), { includeSecrets: false })),
      models: [model('same'), model('same')],
    };

    await expect(importTransferConfig(file, createMemoryStore())).rejects.toThrow(/duplicate ids/);
  });

  it('keeps rows it cannot read that were already in storage', async () => {
    // An import may replace what the user is looking at; it may not delete data
    // it does not understand.
    const store = createMemoryStore();
    store.seed(MODEL_CONFIGS_STORAGE_KEY, {
      version: MODEL_CONFIGS_VERSION,
      data: { rows: [{ foo: 1 }] },
    });
    const file: TransferFile = {
      ...(await exportTransferConfig(createMemoryStore(), { includeSecrets: false })),
      models: [model('m1')],
    };

    const result = await importTransferConfig(file, store);

    expect(result.models).toMatchObject({ unrecognized: [{ foo: 1 }] });
    expect((await loadModelConfigs(store)).unrecognized).toEqual([{ foo: 1 }]);
  });

  it('reconciles the file selection against what actually landed', async () => {
    const file: TransferFile = {
      ...(await exportTransferConfig(createMemoryStore(), { includeSecrets: false })),
      models: [model('m1'), model('m2')],
      prompts: [prompt('p1')],
      // The default points at a row this build cannot read, so it will be skipped.
      selection: { defaultModelId: 'gone', defaultPromptId: null, promptLibrarySeeded: false },
    };

    const result = await importTransferConfig(file, createMemoryStore());

    expect(result.selection.defaultModelId).toBe('m1');
    expect((await loadSelection(createMemoryStore())).defaultModelId).toBeNull();
  });

  it('replaces what was there, rather than merging into it', async () => {
    const store = await seededStore();
    const file: TransferFile = {
      ...(await exportTransferConfig(createMemoryStore(), { includeSecrets: false })),
      models: [model('fresh')],
      prompts: [],
    };

    await importTransferConfig(file, store);

    // A restore, not a merge: the confirmation the UI shows says exactly this.
    expect((await loadModelConfigs(store)).models.map((entry) => entry.id)).toEqual(['fresh']);
    expect((await loadPromptConfigs(store)).prompts).toEqual([]);
    expect(store.dump[PROMPT_CONFIGS_STORAGE_KEY]).toEqual({
      version: 1,
      data: { rows: [] },
    });
  });
});
