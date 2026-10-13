import { defineBackground } from 'wxt/utils/define-background';

import { createLogger } from '@/platform/logger';
import { registerRpcHandlers } from '@/platform/rpc/server';
import {
  loadGeneralSettings,
  saveGeneralSettings,
} from '@/platform/settings/general-settings-service';
import { wxtStore } from '@/platform/storage/wxt-store';

const logger = createLogger('background');

/**
 * The background is assembly only: it wires the storage adapter to the handlers
 * and registers the control plane. Behaviour lives in `platform/` and `domain/`
 * so it can be unit-tested without a service worker, which is the whole point
 * of the split.
 */
export default defineBackground(() => {
  registerRpcHandlers({
    loadGeneralSettings: () => loadGeneralSettings(wxtStore),
    saveGeneralSettings: (patch) => saveGeneralSettings(patch, wxtStore),
  });

  logger.info('background ready');
});
