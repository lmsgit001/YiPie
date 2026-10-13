import { z } from 'zod';

import { GeneralSettings, GeneralSettingsPatch } from './general-settings';
import { MigrationReport } from './migration';
import { ModelConfigsView } from './model-config';
import {
  ModelConfigAddInput,
  ModelConfigMoveInput,
  ModelConfigRemoveInput,
  ModelConfigRemoveResult,
  ModelConfigUpdateInput,
  PromptConfigAddInput,
  PromptConfigMoveInput,
  PromptConfigRemoveInput,
  PromptConfigRemoveResult,
  PromptConfigUpdateInput,
  SetDefaultModelInput,
  SetDefaultPromptInput,
} from './mutations';
import { PromptConfigsView, PromptLibrarySeedResult } from './prompt-config';
import { Selection } from './selection';

/**
 * The control-plane contract. Both sides of the extension derive their types
 * from this table, and the background validates every incoming payload against
 * it — so a content script from a different build cannot hand the background a
 * shape it was not written for.
 *
 * `write: true` marks a method that mutates persistent state. Handlers for
 * those run inside the single storage queue (see platform/storage/tx.ts).
 */
export const rpcContract = {
  'settings.load': {
    input: z.void(),
    output: GeneralSettings,
  },
  'settings.save': {
    input: GeneralSettingsPatch,
    output: GeneralSettings,
    write: true,
  },
  'migration.run': {
    input: z.void(),
    output: MigrationReport,
    write: true,
  },
  'selection.load': {
    input: z.void(),
    output: Selection,
  },
  'selection.setDefaultModel': {
    input: SetDefaultModelInput,
    output: Selection,
    write: true,
  },
  'selection.setDefaultPrompt': {
    input: SetDefaultPromptInput,
    output: Selection,
    write: true,
  },
  'model-configs.load': {
    input: z.void(),
    output: ModelConfigsView,
  },
  'model-configs.add': {
    input: ModelConfigAddInput,
    output: ModelConfigsView,
    write: true,
  },
  'model-configs.update': {
    input: ModelConfigUpdateInput,
    output: ModelConfigsView,
    write: true,
  },
  'model-configs.remove': {
    input: ModelConfigRemoveInput,
    output: ModelConfigRemoveResult,
    write: true,
  },
  'model-configs.move': {
    input: ModelConfigMoveInput,
    output: ModelConfigsView,
    write: true,
  },
  'prompt-configs.load': {
    input: z.void(),
    output: PromptConfigsView,
  },
  'prompt-configs.add': {
    input: PromptConfigAddInput,
    output: PromptConfigsView,
    write: true,
  },
  'prompt-configs.update': {
    input: PromptConfigUpdateInput,
    output: PromptConfigsView,
    write: true,
  },
  'prompt-configs.remove': {
    input: PromptConfigRemoveInput,
    output: PromptConfigRemoveResult,
    write: true,
  },
  'prompt-configs.move': {
    input: PromptConfigMoveInput,
    output: PromptConfigsView,
    write: true,
  },
  'prompt-configs.ensureLibrary': {
    input: z.void(),
    output: PromptLibrarySeedResult,
    write: true,
  },
} as const;

export type RpcMethod = keyof typeof rpcContract;

/**
 * The shape `@webext-core/messaging` expects. Note the return types are the
 * *resolved* values: the library types `sendMessage` as `Promise<ReturnType>`,
 * so declaring `Promise<T>` here would double-wrap every call.
 */
export interface ProtocolMap {
  'settings.load': () => Promise<GeneralSettings>;
  'settings.save': (patch: GeneralSettingsPatch) => Promise<GeneralSettings>;
  'migration.run': () => Promise<MigrationReport>;
  'selection.load': () => Promise<Selection>;
  'selection.setDefaultModel': (input: SetDefaultModelInput) => Promise<Selection>;
  'selection.setDefaultPrompt': (input: SetDefaultPromptInput) => Promise<Selection>;
  'model-configs.load': () => Promise<ModelConfigsView>;
  'model-configs.add': (input: ModelConfigAddInput) => Promise<ModelConfigsView>;
  'model-configs.update': (input: ModelConfigUpdateInput) => Promise<ModelConfigsView>;
  'model-configs.remove': (input: ModelConfigRemoveInput) => Promise<ModelConfigRemoveResult>;
  'model-configs.move': (input: ModelConfigMoveInput) => Promise<ModelConfigsView>;
  'prompt-configs.load': () => Promise<PromptConfigsView>;
  'prompt-configs.add': (input: PromptConfigAddInput) => Promise<PromptConfigsView>;
  'prompt-configs.update': (input: PromptConfigUpdateInput) => Promise<PromptConfigsView>;
  'prompt-configs.remove': (input: PromptConfigRemoveInput) => Promise<PromptConfigRemoveResult>;
  'prompt-configs.move': (input: PromptConfigMoveInput) => Promise<PromptConfigsView>;
  'prompt-configs.ensureLibrary': () => Promise<PromptLibrarySeedResult>;
}
