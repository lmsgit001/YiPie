import {
  GeneralSettings,
  GeneralSettingsPatch,
  ModelConfigAddInput,
  ModelConfigMoveInput,
  ModelConfigRemoveInput,
  ModelConfigUpdateInput,
  PromptConfigAddInput,
  PromptConfigMoveInput,
  PromptConfigRemoveInput,
  PromptConfigUpdateInput,
  SetDefaultModelInput,
  SetDefaultPromptInput,
  TransferExportOptions,
  TransferFile,
  type GeneralSettings as GeneralSettingsValue,
  type MigrationReport as MigrationReportValue,
  type GeneralSettingsPatch as GeneralSettingsPatchValue,
  type ModelConfigRemoveResult as ModelConfigRemoveResultValue,
  type ModelConfigsView as ModelConfigsViewValue,
  type PromptConfigRemoveResult as PromptConfigRemoveResultValue,
  type PromptConfigsView as PromptConfigsViewValue,
  type PromptLibrarySeedResult as PromptLibrarySeedResultValue,
  type Selection as SelectionValue,
  type TransferFile as TransferFileValue,
  type TransferImportResult as TransferImportResultValue,
  type TransferPreview as TransferPreviewValue,
} from '@/contract';

import { onMessage } from './messaging';
import { assertTrustedSender } from './trust';

import type { z } from 'zod';

/**
 * What the background can serve. Declaring the surface as an interface (rather
 * than letting each module register its own handler) keeps every capability
 * listed in one place, which is what makes it reviewable.
 */
export interface RpcHandlers {
  loadGeneralSettings: () => Promise<GeneralSettingsValue>;
  saveGeneralSettings: (patch: GeneralSettingsPatchValue) => Promise<GeneralSettingsValue>;
  loadSelection: () => Promise<SelectionValue>;
  setDefaultModel: (input: SetDefaultModelInput) => Promise<SelectionValue>;
  setDefaultPrompt: (input: SetDefaultPromptInput) => Promise<SelectionValue>;
  loadModelConfigs: () => Promise<ModelConfigsViewValue>;
  addModelConfig: (input: ModelConfigAddInput) => Promise<ModelConfigsViewValue>;
  updateModelConfig: (input: ModelConfigUpdateInput) => Promise<ModelConfigsViewValue>;
  removeModelConfig: (input: ModelConfigRemoveInput) => Promise<ModelConfigRemoveResultValue>;
  moveModelConfig: (input: ModelConfigMoveInput) => Promise<ModelConfigsViewValue>;
  loadPromptConfigs: () => Promise<PromptConfigsViewValue>;
  addPromptConfig: (input: PromptConfigAddInput) => Promise<PromptConfigsViewValue>;
  updatePromptConfig: (input: PromptConfigUpdateInput) => Promise<PromptConfigsViewValue>;
  removePromptConfig: (input: PromptConfigRemoveInput) => Promise<PromptConfigRemoveResultValue>;
  movePromptConfig: (input: PromptConfigMoveInput) => Promise<PromptConfigsViewValue>;
  ensurePromptLibrary: () => Promise<PromptLibrarySeedResultValue>;
  runMigrations: () => Promise<MigrationReportValue>;
  exportTransfer: (options: TransferExportOptions) => Promise<TransferFileValue>;
  previewTransferImport: (file: TransferFileValue) => Promise<TransferPreviewValue>;
  importTransfer: (file: TransferFileValue) => Promise<TransferImportResultValue>;
}

/**
 * Parse an incoming payload, naming the method that was rejected.
 *
 * Every handler that takes input goes through this, so "forgot to validate" is
 * not a failure mode this layer can have — the registration below is the only
 * place a handler is attached, and the parse is not optional there.
 */
function parseInput<S extends z.ZodType>(schema: S, method: string, data: unknown): z.output<S> {
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    throw new Error(
      `Invalid ${method} input: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
    );
  }

  return parsed.data;
}

/** Trust check + input parse, applied once per method instead of once per line. */
function guarded<S extends z.ZodType, R>(
  method: string,
  schema: S,
  handler: (input: z.output<S>) => Promise<R>,
): (message: { sender: unknown; data: unknown }) => Promise<R> {
  return (message) => {
    assertTrustedSender(message.sender);
    return handler(parseInput(schema, method, message.data));
  };
}

/** Trust check for a method that takes no input. */
function guardedNoInput<R>(
  handler: () => Promise<R>,
): (message: { sender: unknown }) => Promise<R> {
  return (message) => {
    assertTrustedSender(message.sender);
    return handler();
  };
}

/**
 * Register the control plane. Every handler gets the trust check and an input
 * parse; no handler is allowed to opt out.
 */
export function registerRpcHandlers(handlers: RpcHandlers): void {
  onMessage('settings.load', guardedNoInput(handlers.loadGeneralSettings));
  onMessage(
    'settings.save',
    guarded('settings.save', GeneralSettingsPatch, handlers.saveGeneralSettings),
  );

  onMessage('migration.run', guardedNoInput(handlers.runMigrations));

  onMessage(
    'transfer.export',
    guarded('transfer.export', TransferExportOptions, handlers.exportTransfer),
  );
  onMessage(
    'transfer.preview',
    guarded('transfer.preview', TransferFile, handlers.previewTransferImport),
  );
  onMessage('transfer.import', guarded('transfer.import', TransferFile, handlers.importTransfer));

  onMessage('selection.load', guardedNoInput(handlers.loadSelection));
  onMessage(
    'selection.setDefaultModel',
    guarded('selection.setDefaultModel', SetDefaultModelInput, handlers.setDefaultModel),
  );
  onMessage(
    'selection.setDefaultPrompt',
    guarded('selection.setDefaultPrompt', SetDefaultPromptInput, handlers.setDefaultPrompt),
  );

  onMessage('model-configs.load', guardedNoInput(handlers.loadModelConfigs));
  onMessage(
    'model-configs.add',
    guarded('model-configs.add', ModelConfigAddInput, handlers.addModelConfig),
  );
  onMessage(
    'model-configs.update',
    guarded('model-configs.update', ModelConfigUpdateInput, handlers.updateModelConfig),
  );
  onMessage(
    'model-configs.remove',
    guarded('model-configs.remove', ModelConfigRemoveInput, handlers.removeModelConfig),
  );
  onMessage(
    'model-configs.move',
    guarded('model-configs.move', ModelConfigMoveInput, handlers.moveModelConfig),
  );

  onMessage('prompt-configs.load', guardedNoInput(handlers.loadPromptConfigs));
  onMessage(
    'prompt-configs.add',
    guarded('prompt-configs.add', PromptConfigAddInput, handlers.addPromptConfig),
  );
  onMessage(
    'prompt-configs.update',
    guarded('prompt-configs.update', PromptConfigUpdateInput, handlers.updatePromptConfig),
  );
  onMessage(
    'prompt-configs.remove',
    guarded('prompt-configs.remove', PromptConfigRemoveInput, handlers.removePromptConfig),
  );
  onMessage(
    'prompt-configs.move',
    guarded('prompt-configs.move', PromptConfigMoveInput, handlers.movePromptConfig),
  );
  onMessage('prompt-configs.ensureLibrary', guardedNoInput(handlers.ensurePromptLibrary));
}

/** Re-exported so the background can build its handler map from one import. */
export { GeneralSettings };
