import {
  classifyPromptConfigRows,
  DEFAULT_PROMPT_LIBRARY,
  PromptConfig,
  PromptConfigMoveInput,
  PromptConfigRemoveInput,
  PromptConfigsRecord,
  PROMPT_CONFIGS_STORAGE_KEY,
  PROMPT_CONFIGS_VERSION,
  PromptConfigUpdateInput,
  PROMPT_VARIABLES,
  toStoredPromptConfigRows,
  type PromptConfigAddInput as PromptConfigAddInputValue,
  type PromptConfigMoveInput as PromptConfigMoveInputValue,
  type PromptConfigRemoveInput as PromptConfigRemoveInputValue,
  type PromptConfigsView as PromptConfigsViewValue,
  type PromptConfigUpdateInput as PromptConfigUpdateInputValue,
  type PromptConfig as PromptConfigValue,
} from '@/contract';
import { findUnknownPromptVariables } from '@/domain/prompt/template';
import { createLogger } from '@/platform/logger';
import { loadSelection, saveSelection } from '@/platform/settings/selection-service';
import { readValidated, writeValidated } from '@/platform/storage/repo';
import { enqueue } from '@/platform/storage/tx';

import type { StorageLike } from '@/platform/storage/types';

const logger = createLogger('prompt-configs');

async function readStoredRows(store: StorageLike): Promise<unknown[]> {
  const result = await readValidated(store, PROMPT_CONFIGS_STORAGE_KEY, PromptConfigsRecord);

  if (result.status === 'ok') return result.value.data.rows;
  if (result.status === 'invalid') {
    logger.warn(
      `Stored prompt configs at ${PROMPT_CONFIGS_STORAGE_KEY} are unreadable; showing an empty list`,
      result.issues,
    );
  }
  return [];
}

async function writeView(
  view: PromptConfigsViewValue,
  store: StorageLike,
): Promise<PromptConfigsViewValue> {
  await writeValidated(store, PROMPT_CONFIGS_STORAGE_KEY, PromptConfigsRecord, {
    version: PROMPT_CONFIGS_VERSION,
    data: { rows: toStoredPromptConfigRows(view) },
  });

  return view;
}

/**
 * Reject a template that mentions a variable this build cannot fill.
 *
 * An unknown name is either a typo or a variable from a newer build; both render
 * as literal `{{braces}}` in the prompt, which the model then reads as content.
 * This is the interactive path only — an *imported* file gets a notice instead,
 * because a backup written by a future build must stay loadable.
 */
function assertKnownVariables(config: PromptConfigValue): void {
  const unknown = [
    ...new Set([
      ...findUnknownPromptVariables(config.systemTemplate, PROMPT_VARIABLES),
      ...findUnknownPromptVariables(config.userTemplate, PROMPT_VARIABLES),
    ]),
  ];

  if (unknown.length > 0) {
    throw new Error(
      `Unknown prompt variable(s): ${unknown.join(', ')}. Available: ${PROMPT_VARIABLES.join(', ')}`,
    );
  }
}

export async function loadPromptConfigs(store: StorageLike): Promise<PromptConfigsViewValue> {
  return classifyPromptConfigRows(await readStoredRows(store));
}

export async function addPromptConfig(
  input: PromptConfigAddInputValue,
  store: StorageLike,
): Promise<PromptConfigsViewValue> {
  const config = PromptConfig.parse(input);
  assertKnownVariables(config);

  return enqueue(async () => {
    const view = classifyPromptConfigRows(await readStoredRows(store));

    if (view.prompts.some((candidate) => candidate.id === config.id)) {
      throw new Error(`A prompt config with id "${config.id}" already exists`);
    }

    return writeView(
      { prompts: [...view.prompts, config], unrecognized: view.unrecognized },
      store,
    );
  });
}

export async function updatePromptConfig(
  input: PromptConfigUpdateInputValue,
  store: StorageLike,
): Promise<PromptConfigsViewValue> {
  const { id, patch } = PromptConfigUpdateInput.parse(input);

  return enqueue(async () => {
    const view = classifyPromptConfigRows(await readStoredRows(store));

    if (!view.prompts.some((candidate) => candidate.id === id)) {
      throw new Error(`No prompt config with id "${id}"`);
    }

    const prompts = view.prompts.map((candidate) => {
      if (candidate.id !== id) return candidate;

      const next = PromptConfig.parse({ ...candidate, ...patch });
      assertKnownVariables(next);
      return next;
    });

    return writeView({ prompts, unrecognized: view.unrecognized }, store);
  });
}

export async function removePromptConfig(
  input: PromptConfigRemoveInputValue,
  store: StorageLike,
): Promise<PromptConfigsViewValue> {
  const { id } = PromptConfigRemoveInput.parse(input);

  return enqueue(async () => {
    const view = classifyPromptConfigRows(await readStoredRows(store));

    if (!view.prompts.some((candidate) => candidate.id === id)) {
      throw new Error(`No prompt config with id "${id}"`);
    }

    return writeView(
      {
        prompts: view.prompts.filter((candidate) => candidate.id !== id),
        unrecognized: view.unrecognized,
      },
      store,
    );
  });
}

/** See `moveModelConfig`: the target index is clamped, never rejected. */
export async function movePromptConfig(
  input: PromptConfigMoveInputValue,
  store: StorageLike,
): Promise<PromptConfigsViewValue> {
  const { id, toIndex } = PromptConfigMoveInput.parse(input);

  return enqueue(async () => {
    const view = classifyPromptConfigRows(await readStoredRows(store));
    const moved = view.prompts.find((candidate) => candidate.id === id);

    if (!moved) throw new Error(`No prompt config with id "${id}"`);

    const prompts = view.prompts.filter((candidate) => candidate.id !== id);
    prompts.splice(Math.min(toIndex, prompts.length), 0, moved);

    return writeView({ prompts, unrecognized: view.unrecognized }, store);
  });
}

/**
 * Add the rows the library is missing and mark it seeded.
 *
 * Called by the UI, not at service-worker start: MV3 wakes the worker on demand,
 * and doing work there turns a slow start into a missing feature. Seeding is
 * idempotent *by id*, so being interrupted between the two writes cannot leave
 * duplicates behind — a second run finds the presets already in place.
 */
export async function seedPromptLibraryIfNeeded(
  store: StorageLike,
): Promise<{ seeded: boolean; addedIds: string[] }> {
  const selection = await loadSelection(store);
  if (selection.promptLibrarySeeded) return { seeded: false, addedIds: [] };

  const view = await loadPromptConfigs(store);
  const missing = DEFAULT_PROMPT_LIBRARY.filter(
    (preset) => !view.prompts.some((existing) => existing.id === preset.id),
  );

  if (missing.length > 0) await appendPromptConfigs(missing, store);

  await saveSelection(
    {
      promptLibrarySeeded: true,
      defaultPromptId: selection.defaultPromptId ?? missing[0]?.id ?? view.prompts[0]?.id ?? null,
    },
    store,
  );

  return { seeded: true, addedIds: missing.map((preset) => preset.id) };
}

/** Rows already present win, so a preset the user edited is never overwritten. */
async function appendPromptConfigs(
  configs: readonly PromptConfigValue[],
  store: StorageLike,
): Promise<PromptConfigsViewValue> {
  return enqueue(async () => {
    const view = classifyPromptConfigRows(await readStoredRows(store));
    const existing = new Set(view.prompts.map((prompt) => prompt.id));
    const added = configs.filter((config) => !existing.has(config.id));

    if (added.length === 0) return view;

    return writeView(
      { prompts: [...view.prompts, ...added], unrecognized: view.unrecognized },
      store,
    );
  });
}
