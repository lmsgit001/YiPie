import {
  classifyModelConfigRows,
  ModelConfig,
  ModelConfigMoveInput,
  ModelConfigRemoveInput,
  ModelConfigsRecord,
  MODEL_CONFIGS_STORAGE_KEY,
  MODEL_CONFIGS_VERSION,
  ModelConfigUpdateInput,
  toStoredRows,
  type ModelConfigAddInput as ModelConfigAddInputValue,
  type ModelConfigMoveInput as ModelConfigMoveInputValue,
  type ModelConfigRemoveInput as ModelConfigRemoveInputValue,
  type ModelConfigsView as ModelConfigsViewValue,
  type ModelConfigUpdateInput as ModelConfigUpdateInputValue,
} from '@/contract';
import { createLogger } from '@/platform/logger';
import { readValidated, writeValidated } from '@/platform/storage/repo';
import { enqueue } from '@/platform/storage/tx';

import type { StorageLike } from '@/platform/storage/types';

const logger = createLogger('model-configs');

/**
 * Read the stored rows, treating both "absent" and "unreadable" as "nothing yet"
 * *for this read only*.
 *
 * An unreadable envelope is logged with the exact zod paths and deliberately not
 * written back. Repairing it silently is how the previous implementation
 * destroyed records: it read, failed to understand, and then persisted its own
 * misunderstanding. Here the damaged value stays on disk until the user's next
 * explicit change rewrites the key.
 */
async function readStoredRows(store: StorageLike): Promise<unknown[]> {
  const result = await readValidated(store, MODEL_CONFIGS_STORAGE_KEY, ModelConfigsRecord);

  if (result.status === 'ok') return result.value.data.rows;
  if (result.status === 'invalid') {
    logger.warn(
      `Stored model configs at ${MODEL_CONFIGS_STORAGE_KEY} are unreadable; showing an empty list`,
      result.issues,
    );
  }
  return [];
}

/** Write the whole list back, keeping every row we did not understand. */
async function writeView(
  view: ModelConfigsViewValue,
  store: StorageLike,
): Promise<ModelConfigsViewValue> {
  await writeValidated(store, MODEL_CONFIGS_STORAGE_KEY, ModelConfigsRecord, {
    version: MODEL_CONFIGS_VERSION,
    data: { rows: toStoredRows(view) },
  });

  return view;
}

export async function loadModelConfigs(store: StorageLike): Promise<ModelConfigsViewValue> {
  return classifyModelConfigRows(await readStoredRows(store));
}

/**
 * Add one config. The id comes from the caller because it is the handle the UI
 * uses for every later operation, and a duplicate would make those operations
 * ambiguous — so a collision is rejected here rather than repaired silently.
 */
export async function addModelConfig(
  input: ModelConfigAddInputValue,
  store: StorageLike,
): Promise<ModelConfigsViewValue> {
  const config = ModelConfig.parse(input);

  return enqueue(async () => {
    const view = classifyModelConfigRows(await readStoredRows(store));

    if (view.models.some((candidate) => candidate.id === config.id)) {
      throw new Error(`A model config with id "${config.id}" already exists`);
    }

    return writeView({ models: [...view.models, config], unrecognized: view.unrecognized }, store);
  });
}

/**
 * Apply a patch to one config. The patch is merged over the freshly read record,
 * not over whatever the caller had in hand, so fields the patch does not mention
 * keep their stored value.
 */
export async function updateModelConfig(
  input: ModelConfigUpdateInputValue,
  store: StorageLike,
): Promise<ModelConfigsViewValue> {
  const { id, patch } = ModelConfigUpdateInput.parse(input);

  return enqueue(async () => {
    const view = classifyModelConfigRows(await readStoredRows(store));

    if (!view.models.some((candidate) => candidate.id === id)) {
      throw new Error(`No model config with id "${id}"`);
    }

    const models = view.models.map((candidate) =>
      candidate.id === id ? ModelConfig.parse({ ...candidate, ...patch }) : candidate,
    );

    return writeView({ models, unrecognized: view.unrecognized }, store);
  });
}

/**
 * Remove one config. Rows we could not read are left alone: deleting a config
 * must not become an excuse to prune the list around it.
 */
export async function removeModelConfig(
  input: ModelConfigRemoveInputValue,
  store: StorageLike,
): Promise<ModelConfigsViewValue> {
  const { id } = ModelConfigRemoveInput.parse(input);

  return enqueue(async () => {
    const view = classifyModelConfigRows(await readStoredRows(store));

    if (!view.models.some((candidate) => candidate.id === id)) {
      throw new Error(`No model config with id "${id}"`);
    }

    return writeView(
      {
        models: view.models.filter((candidate) => candidate.id !== id),
        unrecognized: view.unrecognized,
      },
      store,
    );
  });
}

/**
 * Move one config to `toIndex` — its final index among the configs. The target is
 * clamped instead of rejected: a drag-and-drop UI can legitimately report an
 * index that is out of range after a concurrent removal, and refusing that would
 * surface as a failed save with nothing wrong for the user to fix.
 */
export async function moveModelConfig(
  input: ModelConfigMoveInputValue,
  store: StorageLike,
): Promise<ModelConfigsViewValue> {
  const { id, toIndex } = ModelConfigMoveInput.parse(input);

  return enqueue(async () => {
    const view = classifyModelConfigRows(await readStoredRows(store));
    const moved = view.models.find((candidate) => candidate.id === id);

    if (!moved) throw new Error(`No model config with id "${id}"`);

    const models = view.models.filter((candidate) => candidate.id !== id);
    models.splice(Math.min(toIndex, models.length), 0, moved);

    return writeView({ models, unrecognized: view.unrecognized }, store);
  });
}
