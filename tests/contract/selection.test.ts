import { describe, expect, it } from 'vitest';

import {
  createDefaultSelection,
  reconcileSelection,
  resolveDefaultId,
  Selection,
  SelectionPatch,
  SelectionRecord,
  SELECTION_VERSION,
} from '@/contract';

describe('Selection schema', () => {
  it('starts with no default and nothing seeded', () => {
    expect(createDefaultSelection()).toEqual({
      defaultModelId: null,
      defaultPromptId: null,
      promptLibrarySeeded: false,
    });
  });

  it('accepts an explicit null default but not an empty string', () => {
    expect(Selection.safeParse({ defaultModelId: null }).success).toBe(true);
    expect(Selection.safeParse({ defaultModelId: '' }).success).toBe(false);
  });

  it('keeps a patch free of defaults', () => {
    expect(SelectionPatch.parse({})).toEqual({});
    expect(SelectionPatch.parse({ defaultModelId: 'a' })).not.toHaveProperty('defaultPromptId');
  });

  it('rejects an envelope written by a different schema version', () => {
    const future = { version: SELECTION_VERSION + 1, data: createDefaultSelection() };

    expect(SelectionRecord.safeParse(future).success).toBe(false);
  });
});

describe('resolveDefaultId', () => {
  it('keeps a default that still exists', () => {
    expect(resolveDefaultId('b', ['a', 'b'])).toBe('b');
  });

  it('falls back to the first id when the default is gone', () => {
    // The previous project shipped a state where the default pointed at a row
    // that had been deleted, and the panel rendered nothing.
    expect(resolveDefaultId('gone', ['a', 'b'])).toBe('a');
  });

  it('adopts the first id when nothing has been chosen yet', () => {
    expect(resolveDefaultId(null, ['a'])).toBe('a');
  });

  it('is null for an empty list, whatever was chosen before', () => {
    expect(resolveDefaultId('a', [])).toBeNull();
    expect(resolveDefaultId(null, [])).toBeNull();
  });
});

describe('reconcileSelection', () => {
  it('repairs a dangling default and says that it moved', () => {
    const result = reconcileSelection(
      { defaultModelId: 'gone', defaultPromptId: null, promptLibrarySeeded: false },
      { modelIds: ['a', 'b'] },
    );

    expect(result.changed).toBe(true);
    expect(result.selection.defaultModelId).toBe('a');
  });

  it('does not touch a default whose list was not passed in', () => {
    const result = reconcileSelection(
      { defaultModelId: 'gone', defaultPromptId: 'p1', promptLibrarySeeded: false },
      { modelIds: ['a'] },
    );

    // Removing a model must not be an excuse to move the prompt default.
    expect(result.selection.defaultPromptId).toBe('p1');
  });

  it('reports no change when every default is still valid', () => {
    const current = { defaultModelId: 'a', defaultPromptId: 'p1', promptLibrarySeeded: true };
    const result = reconcileSelection(current, { modelIds: ['a'], promptIds: ['p1'] });

    expect(result.changed).toBe(false);
    expect(result.selection).toEqual(current);
  });
});
