import type { StorageLike } from '@/platform/storage/types';

import {
  createDefaultGeneralSettings,
  GeneralSettings,
  GENERAL_SETTINGS_STORAGE_KEY,
  GENERAL_SETTINGS_VERSION,
  GeneralSettingsRecord,
  type GeneralSettings as GeneralSettingsValue,
  type GeneralSettingsPatch,
} from '@/contract';
import { createLogger } from '@/platform/logger';
import { readValidated, writeValidated } from '@/platform/storage/repo';
import { enqueue } from '@/platform/storage/tx';

const logger = createLogger('settings');

/**
 * Read the settings, repairing anything unreadable instead of throwing.
 *
 * A corrupt record must not brick the options page: the user cannot fix a value
 * they cannot see. Damage is logged with the exact zod issues and defaults are
 * used for this session; the next save rewrites the key cleanly.
 */
export async function loadGeneralSettings(store: StorageLike): Promise<GeneralSettingsValue> {
  const result = await readValidated(store, GENERAL_SETTINGS_STORAGE_KEY, GeneralSettingsRecord);

  if (result.status === 'ok') return result.value.data;
  if (result.status === 'invalid') {
    logger.warn(
      `Stored settings at ${GENERAL_SETTINGS_STORAGE_KEY} are unreadable; using defaults`,
      result.issues,
    );
  }
  return createDefaultGeneralSettings();
}

/**
 * Apply a partial update. Serialised through the single queue so two contexts
 * saving different fields at the same moment cannot clobber each other, and
 * merged against a freshly read value so untouched fields keep their content.
 */
export async function saveGeneralSettings(
  patch: GeneralSettingsPatch,
  store: StorageLike,
): Promise<GeneralSettingsValue> {
  return enqueue(async () => {
    const current = await loadGeneralSettings(store);
    const next = GeneralSettings.parse({ ...current, ...patch });

    await writeValidated(store, GENERAL_SETTINGS_STORAGE_KEY, GeneralSettingsRecord, {
      version: GENERAL_SETTINGS_VERSION,
      data: next,
    });

    return next;
  });
}
