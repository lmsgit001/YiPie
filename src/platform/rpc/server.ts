import {
  GeneralSettings,
  GeneralSettingsPatch,
  ModelConfigAddInput,
  ModelConfigMoveInput,
  ModelConfigRemoveInput,
  ModelConfigUpdateInput,
  type GeneralSettings as GeneralSettingsValue,
  type GeneralSettingsPatch as GeneralSettingsPatchValue,
  type ModelConfigsView as ModelConfigsViewValue,
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
  loadModelConfigs: () => Promise<ModelConfigsViewValue>;
  addModelConfig: (input: ModelConfigAddInput) => Promise<ModelConfigsViewValue>;
  updateModelConfig: (input: ModelConfigUpdateInput) => Promise<ModelConfigsViewValue>;
  removeModelConfig: (input: ModelConfigRemoveInput) => Promise<ModelConfigsViewValue>;
  moveModelConfig: (input: ModelConfigMoveInput) => Promise<ModelConfigsViewValue>;
}

/**
 * Parse an incoming payload, naming the method that was rejected.
 *
 * Every mutating handler goes through this, so "forgot to validate" is not a
 * failure mode this layer can have — the registration below is the only place a
 * handler is attached, and the parse is not optional there.
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

/**
 * Register the control plane. Every handler gets the trust check and an input
 * parse; no handler is allowed to opt out.
 */
export function registerRpcHandlers(handlers: RpcHandlers): void {
  onMessage('settings.load', async (message) => {
    assertTrustedSender(message.sender);
    return handlers.loadGeneralSettings();
  });

  onMessage('settings.save', async (message) => {
    assertTrustedSender(message.sender);
    return handlers.saveGeneralSettings(
      parseInput(GeneralSettingsPatch, 'settings.save', message.data),
    );
  });

  onMessage('model-configs.load', async (message) => {
    assertTrustedSender(message.sender);
    return handlers.loadModelConfigs();
  });

  onMessage('model-configs.add', async (message) => {
    assertTrustedSender(message.sender);
    return handlers.addModelConfig(
      parseInput(ModelConfigAddInput, 'model-configs.add', message.data),
    );
  });

  onMessage('model-configs.update', async (message) => {
    assertTrustedSender(message.sender);
    return handlers.updateModelConfig(
      parseInput(ModelConfigUpdateInput, 'model-configs.update', message.data),
    );
  });

  onMessage('model-configs.remove', async (message) => {
    assertTrustedSender(message.sender);
    return handlers.removeModelConfig(
      parseInput(ModelConfigRemoveInput, 'model-configs.remove', message.data),
    );
  });

  onMessage('model-configs.move', async (message) => {
    assertTrustedSender(message.sender);
    return handlers.moveModelConfig(
      parseInput(ModelConfigMoveInput, 'model-configs.move', message.data),
    );
  });
}

/** Re-exported so the background can build its handler map from one import. */
export { GeneralSettings };
