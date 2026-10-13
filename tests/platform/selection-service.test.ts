import { describe, expect, it } from 'vitest';

import { SELECTION_STORAGE_KEY } from '@/contract';
import { addModelConfig } from '@/platform/settings/model-configs-service';
import {
  loadSelection,
  reconcileDefaults,
  saveSelection,
  setDefaultModel,
  setDefaultPrompt,
} from '@/platform/settings/selection-service';

import { createMemoryStore } from '../helpers/memory-store';

const model = (id: string) => ({
  id,
  name: id,
  baseURL: 'https://api.example.com/v1',
  modelId: 'gpt-4o-mini',
});

describe('selection service', () => {
  it('returns the defaults when nothing is stored', async () => {
    expect(await loadSelection(createMemoryStore())).toEqual({
      defaultModelId: null,
      defaultPromptId: null,
      promptLibrarySeeded: false,
    });
  });

  it('merges a patch over the stored value', async () => {
    const store = createMemoryStore();
    await saveSelection({ defaultModelId: 'a' }, store);
    await saveSelection({ defaultPromptId: 'p1' }, store);

    expect(await loadSelection(store)).toEqual({
      defaultModelId: 'a',
      defaultPromptId: 'p1',
      promptLibrarySeeded: false,
    });
  });

  it('falls back to defaults instead of throwing on a corrupt record', async () => {
    const store = createMemoryStore();
    store.seed(SELECTION_STORAGE_KEY, { version: 1, data: { defaultModelId: 42 } });

    expect(await loadSelection(store)).toEqual({
      defaultModelId: null,
      defaultPromptId: null,
      promptLibrarySeeded: false,
    });
  });

  it('rejects a model default that does not exist', async () => {
    const store = createMemoryStore();

    await expect(setDefaultModel({ id: 'ghost' }, store)).rejects.toThrow(/No model config/);
    expect((await loadSelection(store)).defaultModelId).toBeNull();
  });

  it('sets an existing model default, and clears it with null', async () => {
    const store = createMemoryStore();
    await addModelConfig(model('a'), store);

    expect((await setDefaultModel({ id: 'a' }, store)).defaultModelId).toBe('a');
    expect((await setDefaultModel({ id: null }, store)).defaultModelId).toBeNull();
  });

  it('validates a prompt default against the prompt list', async () => {
    const store = createMemoryStore();

    await expect(setDefaultPrompt({ id: 'ghost' }, store)).rejects.toThrow(/No prompt config/);
  });

  it('repairs a dangling default and reports that it moved', async () => {
    const store = createMemoryStore();
    await saveSelection({ defaultModelId: 'gone' }, store);

    const result = await reconcileDefaults({ modelIds: ['a', 'b'] }, store);

    expect(result.changed).toBe(true);
    expect(result.selection.defaultModelId).toBe('a');
    expect((await loadSelection(store)).defaultModelId).toBe('a');
  });

  it('writes nothing when every default is still valid', async () => {
    const store = createMemoryStore();
    await saveSelection({ defaultModelId: 'a' }, store);
    const before = store.dump[SELECTION_STORAGE_KEY];

    const result = await reconcileDefaults({ modelIds: ['a'] }, store);

    expect(result.changed).toBe(false);
    // Same object on disk: "no change" means no write at all, not a rewrite.
    expect(store.dump[SELECTION_STORAGE_KEY]).toBe(before);
  });

  it('clears a default whose list became empty', async () => {
    const store = createMemoryStore();
    await saveSelection({ defaultModelId: 'a' }, store);

    const result = await reconcileDefaults({ modelIds: [] }, store);

    expect(result.changed).toBe(true);
    expect(result.selection.defaultModelId).toBeNull();
  });
});
