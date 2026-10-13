import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PROMPT_LIBRARY,
  PROMPT_CONFIGS_STORAGE_KEY,
  PROMPT_CONFIGS_VERSION,
} from '@/contract';
import {
  addPromptConfig,
  loadPromptConfigs,
  movePromptConfig,
  removePromptConfig,
  seedPromptLibraryIfNeeded,
  updatePromptConfig,
} from '@/platform/settings/prompt-configs-service';
import { loadSelection, saveSelection } from '@/platform/settings/selection-service';

import { createMemoryStore } from '../helpers/memory-store';

const prompt = (id: string, name = id) => ({
  id,
  name,
  userTemplate: '{{textContent}}',
});

const presetIds = DEFAULT_PROMPT_LIBRARY.map((preset) => preset.id);

describe('prompt configs service', () => {
  it('returns an empty list when nothing is stored', async () => {
    expect(await loadPromptConfigs(createMemoryStore())).toEqual({ prompts: [], unrecognized: [] });
  });

  it('writes the versioned envelope', async () => {
    const store = createMemoryStore();
    await addPromptConfig(prompt('p1'), store);

    expect(store.dump[PROMPT_CONFIGS_STORAGE_KEY]).toEqual({
      version: PROMPT_CONFIGS_VERSION,
      data: { rows: [{ ...prompt('p1'), systemTemplate: '' }] },
    });
  });

  it('rejects a duplicate id', async () => {
    const store = createMemoryStore();
    await addPromptConfig(prompt('p1'), store);

    await expect(addPromptConfig(prompt('p1', '另一个'), store)).rejects.toThrow(/already exists/);
  });

  it('changes only the patched field', async () => {
    const store = createMemoryStore();
    await addPromptConfig({ ...prompt('p1'), systemTemplate: '你是助手' }, store);

    await updatePromptConfig({ id: 'p1', patch: { name: '改名' } }, store);

    expect((await loadPromptConfigs(store)).prompts).toEqual([
      { ...prompt('p1'), name: '改名', systemTemplate: '你是助手' },
    ]);
  });

  it('rejects a template that mentions a variable this build cannot fill', async () => {
    const store = createMemoryStore();

    await expect(
      addPromptConfig({ id: 'p1', name: 'p1', userTemplate: '{{pageTitle}}' }, store),
    ).rejects.toThrow(/Unknown prompt variable.*pageTitle/s);
    // Rejected before the queue: nothing was written.
    expect(store.dump[PROMPT_CONFIGS_STORAGE_KEY]).toBeUndefined();
  });

  it('rejects an unknown variable introduced by a patch', async () => {
    const store = createMemoryStore();
    await addPromptConfig(prompt('p1'), store);

    await expect(
      updatePromptConfig({ id: 'p1', patch: { userTemplate: '{{typo}}' } }, store),
    ).rejects.toThrow(/Unknown prompt variable/);
    expect((await loadPromptConfigs(store)).prompts[0]?.userTemplate).toBe('{{textContent}}');
  });

  it('accepts every built-in template', async () => {
    const store = createMemoryStore();

    for (const preset of DEFAULT_PROMPT_LIBRARY) {
      await addPromptConfig(preset, store);
    }

    expect((await loadPromptConfigs(store)).prompts).toHaveLength(DEFAULT_PROMPT_LIBRARY.length);
  });

  it('refuses to patch, move or remove an id that is not in the list', async () => {
    const store = createMemoryStore();
    await addPromptConfig(prompt('p1'), store);

    await expect(updatePromptConfig({ id: 'ghost', patch: { name: 'x' } }, store)).rejects.toThrow(
      /No prompt config/,
    );
    await expect(movePromptConfig({ id: 'ghost', toIndex: 0 }, store)).rejects.toThrow(
      /No prompt config/,
    );
    await expect(removePromptConfig({ id: 'ghost' }, store)).rejects.toThrow(/No prompt config/);
  });

  it('keeps a row it cannot read, through reads and writes alike', async () => {
    const store = createMemoryStore();
    store.seed(PROMPT_CONFIGS_STORAGE_KEY, {
      version: PROMPT_CONFIGS_VERSION,
      data: { rows: [prompt('p1'), { foo: 1 }] },
    });

    const before = await loadPromptConfigs(store);
    expect(before.prompts.map((config) => config.id)).toEqual(['p1']);
    expect(before.unrecognized).toEqual([{ foo: 1 }]);

    await removePromptConfig({ id: 'p1' }, store);

    const after = await loadPromptConfigs(store);
    expect(after.prompts).toEqual([]);
    expect(after.unrecognized).toEqual([{ foo: 1 }]);
  });

  it('moves a prompt to its final index and clamps a stale target', async () => {
    const store = createMemoryStore();
    await addPromptConfig(prompt('a'), store);
    await addPromptConfig(prompt('b'), store);
    await addPromptConfig(prompt('c'), store);

    await movePromptConfig({ id: 'a', toIndex: 1 }, store);
    expect((await loadPromptConfigs(store)).prompts.map((config) => config.id)).toEqual([
      'b',
      'a',
      'c',
    ]);

    await movePromptConfig({ id: 'b', toIndex: 99 }, store);
    expect((await loadPromptConfigs(store)).prompts.map((config) => config.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it('serialises concurrent changes so none is lost', async () => {
    const store = createMemoryStore();

    await Promise.all([
      addPromptConfig(prompt('a'), store),
      addPromptConfig(prompt('b'), store),
      addPromptConfig(prompt('c'), store),
    ]);

    expect((await loadPromptConfigs(store)).prompts.map((config) => config.id).sort()).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('prompt library seeding', () => {
  it('adds the library once and points the default at its first row', async () => {
    const store = createMemoryStore();

    const result = await seedPromptLibraryIfNeeded(store);

    expect(result).toEqual({ seeded: true, addedIds: presetIds });
    expect((await loadPromptConfigs(store)).prompts.map((config) => config.id)).toEqual(presetIds);
    expect(await loadSelection(store)).toEqual({
      defaultModelId: null,
      defaultPromptId: presetIds[0],
      promptLibrarySeeded: true,
    });
  });

  it('is a no-op on the second run', async () => {
    const store = createMemoryStore();
    await seedPromptLibraryIfNeeded(store);

    expect(await seedPromptLibraryIfNeeded(store)).toEqual({ seeded: false, addedIds: [] });
    expect((await loadPromptConfigs(store)).prompts).toHaveLength(presetIds.length);
  });

  it('keeps an existing default instead of overriding the user', async () => {
    const store = createMemoryStore();
    await addPromptConfig(prompt('mine'), store);
    await saveSelection({ defaultPromptId: 'mine' }, store);

    await seedPromptLibraryIfNeeded(store);

    expect((await loadSelection(store)).defaultPromptId).toBe('mine');
  });

  it('never overwrites a preset the user edited, even if the marker was lost', async () => {
    const store = createMemoryStore();
    await seedPromptLibraryIfNeeded(store);
    await updatePromptConfig({ id: presetIds[0]!, patch: { name: '我改过的' } }, store);
    // Simulate the interrupted write the marker exists to prevent, by clearing it.
    await saveSelection({ promptLibrarySeeded: false }, store);

    const result = await seedPromptLibraryIfNeeded(store);

    expect(result.addedIds).toEqual([]);
    const first = (await loadPromptConfigs(store)).prompts.find(
      (config) => config.id === presetIds[0],
    );
    expect(first?.name).toBe('我改过的');
  });

  it('preserves unreadable rows while seeding', async () => {
    const store = createMemoryStore();
    store.seed(PROMPT_CONFIGS_STORAGE_KEY, {
      version: PROMPT_CONFIGS_VERSION,
      data: { rows: [{ foo: 1 }] },
    });

    await seedPromptLibraryIfNeeded(store);

    const view = await loadPromptConfigs(store);
    expect(view.unrecognized).toEqual([{ foo: 1 }]);
    expect(view.prompts.map((config) => config.id)).toEqual(presetIds);
  });
});
