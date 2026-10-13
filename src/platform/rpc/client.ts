import {
  GeneralSettings,
  ModelConfigsView,
  type GeneralSettings as GeneralSettingsValue,
  type GeneralSettingsPatch,
  type ModelConfigAddInput,
  type ModelConfigMoveInput,
  type ModelConfigRemoveInput,
  type ModelConfigsView as ModelConfigsViewValue,
  type ModelConfigUpdateInput,
} from '@/contract';

import { sendMessage } from './messaging';

/**
 * Validate responses too. The background is trusted code, but a version skew
 * between an old content script and a new worker is a real scenario in a
 * browser that updates the extension while pages stay open — parsing here turns
 * "property of undefined" three call frames later into one clear error.
 */
export async function loadGeneralSettings(): Promise<GeneralSettingsValue> {
  return GeneralSettings.parse(await sendMessage('settings.load', undefined));
}

export async function saveGeneralSettings(
  patch: GeneralSettingsPatch,
): Promise<GeneralSettingsValue> {
  return GeneralSettings.parse(await sendMessage('settings.save', patch));
}

export async function loadModelConfigs(): Promise<ModelConfigsViewValue> {
  return ModelConfigsView.parse(await sendMessage('model-configs.load', undefined));
}

export async function addModelConfig(input: ModelConfigAddInput): Promise<ModelConfigsViewValue> {
  return ModelConfigsView.parse(await sendMessage('model-configs.add', input));
}

export async function updateModelConfig(
  input: ModelConfigUpdateInput,
): Promise<ModelConfigsViewValue> {
  return ModelConfigsView.parse(await sendMessage('model-configs.update', input));
}

export async function removeModelConfig(
  input: ModelConfigRemoveInput,
): Promise<ModelConfigsViewValue> {
  return ModelConfigsView.parse(await sendMessage('model-configs.remove', input));
}

export async function moveModelConfig(input: ModelConfigMoveInput): Promise<ModelConfigsViewValue> {
  return ModelConfigsView.parse(await sendMessage('model-configs.move', input));
}
