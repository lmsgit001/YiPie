import { sendMessage } from './messaging';

import {
  GeneralSettings,
  type GeneralSettings as GeneralSettingsValue,
  type GeneralSettingsPatch,
} from '@/contract';

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
