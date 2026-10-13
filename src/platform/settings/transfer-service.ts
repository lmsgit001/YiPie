import {
  buildTransferFile,
  classifyPromptConfigRows,
  classifyTransferModelRows,
  findDuplicateIds,
  ModelConfigsRecord,
  MODEL_CONFIGS_STORAGE_KEY,
  MODEL_CONFIGS_VERSION,
  previewTransfer,
  PROMPT_CONFIGS_STORAGE_KEY,
  PROMPT_CONFIGS_VERSION,
  PROMPT_VARIABLES,
  PromptConfigsRecord,
  reconcileSelection,
  SelectionRecord,
  SELECTION_STORAGE_KEY,
  SELECTION_VERSION,
  toStoredPromptConfigRows,
  toStoredRows,
  type BuiltTransferFile,
  type TransferFile,
  type TransferImportResult,
  type TransferPreview,
} from '@/contract';
import { findUnknownPromptVariables } from '@/domain/prompt/template';
import { loadModelConfigs } from '@/platform/settings/model-configs-service';
import { loadPromptConfigs } from '@/platform/settings/prompt-configs-service';
import { loadSelection } from '@/platform/settings/selection-service';
import { writeValidated } from '@/platform/storage/repo';
import { enqueue } from '@/platform/storage/tx';

import type { StorageLike } from '@/platform/storage/types';

/**
 * Backup and restore.
 *
 * The one operation in this repo that writes a whole list, and it is a *restore*,
 * not an edit: the UI confirms it as the irreversible act it is. Rows are still
 * classified one by one, so one unfamiliar row costs one row — never the file.
 */

export async function exportTransferConfig(
  store: StorageLike,
  options: { includeSecrets: boolean; appVersion?: string },
): Promise<BuiltTransferFile> {
  const [{ models }, { prompts }, selection] = await Promise.all([
    loadModelConfigs(store),
    loadPromptConfigs(store),
    loadSelection(store),
  ]);

  return buildTransferFile(
    {
      models,
      prompts,
      selection,
      exportedAt: new Date().toISOString(),
      ...(options.appVersion === undefined ? {} : { appVersion: options.appVersion }),
    },
    { includeSecrets: options.includeSecrets },
  );
}

/**
 * What the confirmation dialog shows, before anything is written.
 *
 * Adds the one notice the contract cannot produce: which variables the imported
 * templates mention that this build cannot fill. It is computed here because the
 * template parser lives in `domain/`, and the layers only run one way.
 */
export function previewTransferImport(file: TransferFile): TransferPreview {
  const base = previewTransfer(file);
  const names = [
    ...new Set(
      classifyPromptConfigRows(file.prompts).prompts.flatMap((prompt) => [
        ...findUnknownPromptVariables(prompt.systemTemplate, PROMPT_VARIABLES),
        ...findUnknownPromptVariables(prompt.userTemplate, PROMPT_VARIABLES),
      ]),
    ),
  ].sort();

  if (names.length === 0) return base;

  return { ...base, notices: [...base.notices, { code: 'unknown-variables', names }] };
}

/**
 * Replace the configuration with a file's contents.
 *
 * Three decisions worth stating, because none of them is obvious:
 *  - Rows the file could not be read *as* are skipped and counted, unless that
 *    would be all of them — then the whole import is refused, so "success" never
 *    describes an import that imported nothing.
 *  - Rows already in storage that this build cannot read are *kept*. An import
 *    may replace what the user is looking at; it may not delete data it does not
 *    understand.
 *  - The file's selection is reconciled against what actually landed, so a backup
 *    whose default row was skipped does not restore a dangling pointer.
 */
export async function importTransferConfig(
  file: TransferFile,
  store: StorageLike,
): Promise<TransferImportResult> {
  const preview = previewTransferImport(file);
  const models = classifyTransferModelRows(file.models);
  const prompts = classifyPromptConfigRows(file.prompts);

  if (file.models.length > 0 && models.models.length === 0) {
    throw new Error(
      'None of the model configurations in this file can be read by this version — nothing was imported.',
    );
  }
  if (file.prompts.length > 0 && prompts.prompts.length === 0) {
    throw new Error(
      'None of the prompt configurations in this file can be read by this version — nothing was imported.',
    );
  }

  const duplicateIds = [...findDuplicateIds(models.models), ...findDuplicateIds(prompts.prompts)];
  if (duplicateIds.length > 0) {
    throw new Error(
      `This file contains duplicate ids (${duplicateIds.join(', ')}) — nothing was imported.`,
    );
  }

  // Everything below happens inside one queue task: a restore that half applied
  // would be worse than one that refused. Reads are fine in here; enqueued
  // helpers are not (see tx.ts).
  return enqueue(async () => {
    const [currentModels, currentPrompts] = await Promise.all([
      loadModelConfigs(store),
      loadPromptConfigs(store),
    ]);

    const nextModels = {
      models: models.models,
      unrecognized: currentModels.unrecognized,
    };
    const nextPrompts = {
      prompts: prompts.prompts,
      unrecognized: currentPrompts.unrecognized,
    };
    const { selection } = reconcileSelection(file.selection, {
      modelIds: nextModels.models.map((model) => model.id),
      promptIds: nextPrompts.prompts.map((prompt) => prompt.id),
    });

    await writeValidated(store, MODEL_CONFIGS_STORAGE_KEY, ModelConfigsRecord, {
      version: MODEL_CONFIGS_VERSION,
      data: { rows: toStoredRows(nextModels) },
    });
    await writeValidated(store, PROMPT_CONFIGS_STORAGE_KEY, PromptConfigsRecord, {
      version: PROMPT_CONFIGS_VERSION,
      data: { rows: toStoredPromptConfigRows(nextPrompts) },
    });
    await writeValidated(store, SELECTION_STORAGE_KEY, SelectionRecord, {
      version: SELECTION_VERSION,
      data: selection,
    });

    return {
      models: nextModels,
      prompts: nextPrompts,
      selection,
      notices: preview.notices,
    };
  });
}
