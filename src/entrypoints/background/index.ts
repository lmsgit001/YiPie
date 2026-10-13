import { defineBackground } from 'wxt/utils/define-background';

import { createLogger } from '@/platform/logger';
import { registerRpcHandlers } from '@/platform/rpc/server';
import {
  loadGeneralSettings,
  saveGeneralSettings,
} from '@/platform/settings/general-settings-service';
import {
  addModelConfig,
  loadModelConfigs,
  moveModelConfig,
  removeModelConfig,
  updateModelConfig,
} from '@/platform/settings/model-configs-service';
import { wxtStore } from '@/platform/storage/wxt-store';

const logger = createLogger('background');

/**
 * The background is assembly only: it wires the storage adapter to the handlers
 * and registers the control plane. Behaviour lives in `platform/` and `domain/`
 * so it can be unit-tested without a service worker, which is the whole point
 * of the split.
 *
 * This is also the one place that touches the storage adapter directly. Feature
 * code goes through the RPC client; an ESLint zone rejects anything else.
 */
export default defineBackground(() => {
  registerRpcHandlers({
    loadGeneralSettings: () => loadGeneralSettings(wxtStore),
    saveGeneralSettings: (patch) => saveGeneralSettings(patch, wxtStore),
    loadModelConfigs: () => loadModelConfigs(wxtStore),
    addModelConfig: (input) => addModelConfig(input, wxtStore),
    updateModelConfig: (input) => updateModelConfig(input, wxtStore),
    removeModelConfig: (input) => removeModelConfig(input, wxtStore),
    moveModelConfig: (input) => moveModelConfig(input, wxtStore),
  });

  logger.info('background ready');
});
