import { onMessage } from './messaging';
import { assertTrustedSender } from './trust';

import {
  GeneralSettings,
  GeneralSettingsPatch,
  type GeneralSettings as GeneralSettingsValue,
  type GeneralSettingsPatch as GeneralSettingsPatchValue,
} from '@/contract';

/**
 * What the background can serve. Declaring the surface as an interface (rather
 * than letting each module register its own handler) keeps every capability
 * listed in one place, which is what makes it reviewable.
 */
export interface RpcHandlers {
  loadGeneralSettings: () => Promise<GeneralSettingsValue>;
  saveGeneralSettings: (patch: GeneralSettingsPatchValue) => Promise<GeneralSettingsValue>;
}

/**
 * Register the control plane. Every handler gets the trust check and an input
 * parse; no handler is allowed to opt out, so "forgot to validate" is not a
 * failure mode this layer can have.
 */
export function registerRpcHandlers(handlers: RpcHandlers): void {
  onMessage('settings.load', async (message) => {
    assertTrustedSender(message.sender);
    return handlers.loadGeneralSettings();
  });

  onMessage('settings.save', async (message) => {
    assertTrustedSender(message.sender);

    const patch = GeneralSettingsPatch.safeParse(message.data);
    if (!patch.success) {
      throw new Error(
        `Invalid settings patch: ${patch.error.issues.map((i) => i.message).join('; ')}`,
      );
    }

    return handlers.saveGeneralSettings(patch.data);
  });
}

/** Re-exported so the background can build its handler map from one import. */
export { GeneralSettings };
