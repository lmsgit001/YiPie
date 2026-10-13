import {
  createDefaultSelection,
  reconcileSelection,
  Selection,
  SelectionRecord,
  SELECTION_STORAGE_KEY,
  SELECTION_VERSION,
  type Selection as SelectionValue,
  type SelectionPatch,
  type SetDefaultModelInput,
  type SetDefaultPromptInput,
} from '@/contract';
import { createLogger } from '@/platform/logger';
import { loadModelConfigs } from '@/platform/settings/model-configs-service';
import { loadPromptConfigs } from '@/platform/settings/prompt-configs-service';
import { readValidated, writeValidated } from '@/platform/storage/repo';
import { enqueue } from '@/platform/storage/tx';

import type { StorageLike } from '@/platform/storage/types';

const logger = createLogger('selection');

export async function loadSelection(store: StorageLike): Promise<SelectionValue> {
  const result = await readValidated(store, SELECTION_STORAGE_KEY, SelectionRecord);

  if (result.status === 'ok') return result.value.data;
  if (result.status === 'invalid') {
    logger.warn(
      `Stored selection at ${SELECTION_STORAGE_KEY} is unreadable; using defaults`,
      result.issues,
    );
  }
  return createDefaultSelection();
}

async function writeSelection(
  selection: SelectionValue,
  store: StorageLike,
): Promise<SelectionValue> {
  await writeValidated(store, SELECTION_STORAGE_KEY, SelectionRecord, {
    version: SELECTION_VERSION,
    data: selection,
  });

  return selection;
}

export async function saveSelection(
  patch: SelectionPatch,
  store: StorageLike,
): Promise<SelectionValue> {
  return enqueue(async () => {
    const current = await loadSelection(store);
    return writeSelection(Selection.parse({ ...current, ...patch }), store);
  });
}

/**
 * Point the default at one model, or at nothing.
 *
 * The membership check is here rather than left to the read-time fallback: the
 * fallback keeps the *screen* correct, but a caller that asked for a model which
 * does not exist has made a mistake, and a clear error is how it finds out.
 */
export async function setDefaultModel(
  input: SetDefaultModelInput,
  store: StorageLike,
): Promise<SelectionValue> {
  const { id } = input;

  return enqueue(async () => {
    if (id !== null) {
      const { models } = await loadModelConfigs(store);
      if (!models.some((model) => model.id === id)) {
        throw new Error(`No model config with id "${id}"`);
      }
    }

    const current = await loadSelection(store);
    return writeSelection({ ...current, defaultModelId: id }, store);
  });
}

export async function setDefaultPrompt(
  input: SetDefaultPromptInput,
  store: StorageLike,
): Promise<SelectionValue> {
  const { id } = input;

  return enqueue(async () => {
    if (id !== null) {
      const { prompts } = await loadPromptConfigs(store);
      if (!prompts.some((prompt) => prompt.id === id)) {
        throw new Error(`No prompt config with id "${id}"`);
      }
    }

    const current = await loadSelection(store);
    return writeSelection({ ...current, defaultPromptId: id }, store);
  });
}

/**
 * Repair the defaults after a list changed, and report whether anything moved.
 *
 * Called from the assembly layer, after a removal, with the ids that survived.
 * It writes only when something actually changed, so it is safe to call after
 * every mutation. The `changed` flag is what lets the UI say "默认项已切换为 X"
 * rather than switching it silently.
 */
export async function reconcileDefaults(
  lists: { modelIds?: readonly string[]; promptIds?: readonly string[] },
  store: StorageLike,
): Promise<{ selection: SelectionValue; changed: boolean }> {
  return enqueue(async () => {
    const current = await loadSelection(store);
    const reconciled = reconcileSelection(current, lists);

    if (reconciled.changed) await writeSelection(reconciled.selection, store);

    return reconciled;
  });
}
