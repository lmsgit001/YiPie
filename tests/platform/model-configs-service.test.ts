import { describe, expect, it } from 'vitest';

import { MODEL_CONFIGS_STORAGE_KEY, MODEL_CONFIGS_VERSION } from '@/contract';
import {
  addModelConfig,
  loadModelConfigs,
  moveModelConfig,
  removeModelConfig,
  updateModelConfig,
} from '@/platform/settings/model-configs-service';

import { createMemoryStore } from '../helpers/memory-store';

const model = (id: string, name = id) => ({
  id,
  name,
  baseURL: 'https://api.example.com/v1',
  modelId: 'gpt-4o-mini',
});

describe('model configs service', () => {
  it('returns an empty list when nothing is stored', async () => {
    expect(await loadModelConfigs(createMemoryStore())).toEqual({ models: [], unrecognized: [] });
  });

  it('writes the versioned envelope', async () => {
    const store = createMemoryStore();
    await addModelConfig(model('a'), store);

    expect(store.dump[MODEL_CONFIGS_STORAGE_KEY]).toEqual({
      version: MODEL_CONFIGS_VERSION,
      data: {
        rows: [
          {
            ...model('a'),
            providerId: 'openai-compatible',
            apiKey: '',
            headers: {},
            extraBody: {},
          },
        ],
      },
    });
  });

  it('rejects a duplicate id instead of creating an ambiguous list', async () => {
    const store = createMemoryStore();
    await addModelConfig(model('a'), store);

    await expect(addModelConfig(model('a', '另一个名字'), store)).rejects.toThrow(/already exists/);
    expect((await loadModelConfigs(store)).models).toHaveLength(1);
  });

  it('changes only the patched field', async () => {
    const store = createMemoryStore();
    await addModelConfig({ ...model('a'), apiKey: 'sk-secret' }, store);

    await updateModelConfig({ id: 'a', patch: { name: '改名' } }, store);

    // The stage-0 regression, extended to a list: a patch that carries defaults
    // would have wiped the key and the endpoint here.
    expect((await loadModelConfigs(store)).models).toEqual([
      {
        ...model('a'),
        name: '改名',
        providerId: 'openai-compatible',
        apiKey: 'sk-secret',
        headers: {},
        extraBody: {},
      },
    ]);
  });

  it('refuses to patch or move an id that is not in the list', async () => {
    const store = createMemoryStore();
    await addModelConfig(model('a'), store);

    await expect(updateModelConfig({ id: 'ghost', patch: { name: 'x' } }, store)).rejects.toThrow(
      /No model config/,
    );
    await expect(moveModelConfig({ id: 'ghost', toIndex: 0 }, store)).rejects.toThrow(
      /No model config/,
    );
    await expect(removeModelConfig({ id: 'ghost' }, store)).rejects.toThrow(/No model config/);
  });

  it('keeps a row it cannot read across a later write', async () => {
    // The acceptance criterion from docs/development-plan.md 4.2: a dirty row
    // must not break the read, must not be shown, and must survive a write.
    const store = createMemoryStore();
    store.seed(MODEL_CONFIGS_STORAGE_KEY, {
      version: MODEL_CONFIGS_VERSION,
      data: { rows: [model('a'), { foo: 1 }] },
    });

    const before = await loadModelConfigs(store);
    expect(before.models.map((config) => config.id)).toEqual(['a']);
    expect(before.unrecognized).toEqual([{ foo: 1 }]);

    await addModelConfig(model('b'), store);

    const after = await loadModelConfigs(store);
    expect(after.models.map((config) => config.id)).toEqual(['a', 'b']);
    expect(after.unrecognized).toEqual([{ foo: 1 }]);
  });

  it('does not overwrite a list it cannot read', async () => {
    const store = createMemoryStore();
    const damaged = { version: MODEL_CONFIGS_VERSION, data: { rows: 'not-an-array' } };
    store.seed(MODEL_CONFIGS_STORAGE_KEY, damaged);

    expect(await loadModelConfigs(store)).toEqual({ models: [], unrecognized: [] });
    // Still on disk, untouched: repairing it here is how the previous project
    // destroyed records it failed to parse.
    expect(store.dump[MODEL_CONFIGS_STORAGE_KEY]).toEqual(damaged);
  });

  it('does not overwrite a list written by a newer version', async () => {
    const store = createMemoryStore();
    const fromTheFuture = { version: MODEL_CONFIGS_VERSION + 1, data: { rows: [model('a')] } };
    store.seed(MODEL_CONFIGS_STORAGE_KEY, fromTheFuture);

    expect(await loadModelConfigs(store)).toEqual({ models: [], unrecognized: [] });
    expect(store.dump[MODEL_CONFIGS_STORAGE_KEY]).toEqual(fromTheFuture);
  });

  it('moves a config to its final index', async () => {
    const store = createMemoryStore();
    await addModelConfig(model('a'), store);
    await addModelConfig(model('b'), store);
    await addModelConfig(model('c'), store);

    await moveModelConfig({ id: 'a', toIndex: 2 }, store);
    expect((await loadModelConfigs(store)).models.map((config) => config.id)).toEqual([
      'b',
      'c',
      'a',
    ]);

    // Clamped rather than rejected: a drag-and-drop target can legitimately be
    // stale after a concurrent removal.
    await moveModelConfig({ id: 'b', toIndex: 999 }, store);
    expect((await loadModelConfigs(store)).models.map((config) => config.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('removes only the named config, leaving unreadable rows alone', async () => {
    const store = createMemoryStore();
    store.seed(MODEL_CONFIGS_STORAGE_KEY, {
      version: MODEL_CONFIGS_VERSION,
      data: { rows: [model('a'), { foo: 1 }, model('b')] },
    });

    await removeModelConfig({ id: 'a' }, store);

    const view = await loadModelConfigs(store);
    expect(view.models.map((config) => config.id)).toEqual(['b']);
    expect(view.unrecognized).toEqual([{ foo: 1 }]);
  });

  it('serialises concurrent changes so no addition is lost', async () => {
    const store = createMemoryStore();

    await Promise.all([
      addModelConfig(model('a'), store),
      addModelConfig(model('b'), store),
      addModelConfig(model('c'), store),
    ]);

    expect((await loadModelConfigs(store)).models.map((config) => config.id).sort()).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
