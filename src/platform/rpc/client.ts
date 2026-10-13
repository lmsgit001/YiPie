import {
  GeneralSettings,
  ModelConfigRemoveResult,
  ModelConfigsView,
  PromptConfigRemoveResult,
  PromptConfigsView,
  PromptLibrarySeedResult,
  Selection,
  type GeneralSettings as GeneralSettingsValue,
  type GeneralSettingsPatch,
  type ModelConfigAddInput,
  type ModelConfigMoveInput,
  type ModelConfigRemoveInput,
  type ModelConfigsView as ModelConfigsViewValue,
  type ModelConfigUpdateInput,
  type PromptConfigAddInput,
  type PromptConfigMoveInput,
  type PromptConfigRemoveInput,
  type PromptConfigsView as PromptConfigsViewValue,
  type PromptConfigUpdateInput,
  type PromptLibrarySeedResult as PromptLibrarySeedResultValue,
  type Selection as SelectionValue,
  type SetDefaultModelInput,
  type SetDefaultPromptInput,
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

export async function loadSelection(): Promise<SelectionValue> {
  return Selection.parse(await sendMessage('selection.load', undefined));
}

export async function setDefaultModel(input: SetDefaultModelInput): Promise<SelectionValue> {
  return Selection.parse(await sendMessage('selection.setDefaultModel', input));
}

export async function setDefaultPrompt(input: SetDefaultPromptInput): Promise<SelectionValue> {
  return Selection.parse(await sendMessage('selection.setDefaultPrompt', input));
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

/** Removal reports the selection as well: it is the only change that can move a default. */
export async function removeModelConfig(
  input: ModelConfigRemoveInput,
): Promise<ModelConfigRemoveResult> {
  return ModelConfigRemoveResult.parse(await sendMessage('model-configs.remove', input));
}

export async function moveModelConfig(input: ModelConfigMoveInput): Promise<ModelConfigsViewValue> {
  return ModelConfigsView.parse(await sendMessage('model-configs.move', input));
}

export async function loadPromptConfigs(): Promise<PromptConfigsViewValue> {
  return PromptConfigsView.parse(await sendMessage('prompt-configs.load', undefined));
}

export async function addPromptConfig(
  input: PromptConfigAddInput,
): Promise<PromptConfigsViewValue> {
  return PromptConfigsView.parse(await sendMessage('prompt-configs.add', input));
}

export async function updatePromptConfig(
  input: PromptConfigUpdateInput,
): Promise<PromptConfigsViewValue> {
  return PromptConfigsView.parse(await sendMessage('prompt-configs.update', input));
}

export async function removePromptConfig(
  input: PromptConfigRemoveInput,
): Promise<PromptConfigRemoveResult> {
  return PromptConfigRemoveResult.parse(await sendMessage('prompt-configs.remove', input));
}

export async function movePromptConfig(
  input: PromptConfigMoveInput,
): Promise<PromptConfigsViewValue> {
  return PromptConfigsView.parse(await sendMessage('prompt-configs.move', input));
}

export async function ensurePromptLibrary(): Promise<PromptLibrarySeedResultValue> {
  return PromptLibrarySeedResult.parse(
    await sendMessage('prompt-configs.ensureLibrary', undefined),
  );
}
