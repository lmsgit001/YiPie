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
import {
  addPromptConfig,
  loadPromptConfigs,
  movePromptConfig,
  removePromptConfig,
  seedPromptLibraryIfNeeded,
  updatePromptConfig,
} from '@/platform/settings/prompt-configs-service';
import {
  loadSelection,
  reconcileDefaults,
  setDefaultModel,
  setDefaultPrompt,
} from '@/platform/settings/selection-service';
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
 *
 * Removal is the one operation composed here rather than inside a service: the
 * default must be repaired after the list shrinks, and calling one enqueued
 * operation from inside another would deadlock the queue (see tx.ts).
 */
export default defineBackground(() => {
  registerRpcHandlers({
    loadGeneralSettings: () => loadGeneralSettings(wxtStore),
    saveGeneralSettings: (patch) => saveGeneralSettings(patch, wxtStore),

    loadSelection: () => loadSelection(wxtStore),
    setDefaultModel: (input) => setDefaultModel(input, wxtStore),
    setDefaultPrompt: (input) => setDefaultPrompt(input, wxtStore),

    loadModelConfigs: () => loadModelConfigs(wxtStore),
    addModelConfig: (input) => addModelConfig(input, wxtStore),
    updateModelConfig: (input) => updateModelConfig(input, wxtStore),
    removeModelConfig: async (input) => {
      const configs = await removeModelConfig(input, wxtStore);
      const { selection } = await reconcileDefaults(
        { modelIds: configs.models.map((model) => model.id) },
        wxtStore,
      );
      return { configs, selection };
    },
    moveModelConfig: (input) => moveModelConfig(input, wxtStore),

    loadPromptConfigs: () => loadPromptConfigs(wxtStore),
    addPromptConfig: (input) => addPromptConfig(input, wxtStore),
    updatePromptConfig: (input) => updatePromptConfig(input, wxtStore),
    removePromptConfig: async (input) => {
      const prompts = await removePromptConfig(input, wxtStore);
      const { selection } = await reconcileDefaults(
        { promptIds: prompts.prompts.map((prompt) => prompt.id) },
        wxtStore,
      );
      return { prompts, selection };
    },
    movePromptConfig: (input) => movePromptConfig(input, wxtStore),
    ensurePromptLibrary: () => seedPromptLibraryIfNeeded(wxtStore),
  });

  logger.info('background ready');
});
