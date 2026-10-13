import { describe, expect, it } from 'vitest';

import { createMemoryStore } from '../helpers/memory-store';

import { GENERAL_SETTINGS_STORAGE_KEY } from '@/contract';
import {
  loadGeneralSettings,
  saveGeneralSettings,
} from '@/platform/settings/general-settings-service';

describe('general settings service', () => {
  it('returns defaults when nothing is stored', async () => {
    const store = createMemoryStore();
    expect(await loadGeneralSettings(store)).toEqual({
      theme: 'system',
      panelFontSize: 'medium',
      summaryInputExceedBehaviour: 'front',
      logLevel: 'warn',
    });
  });

  it('falls back to defaults instead of throwing on a corrupt record', async () => {
    const store = createMemoryStore();
    store.seed(GENERAL_SETTINGS_STORAGE_KEY, { version: 1, data: { theme: 'not-a-theme' } });
    expect((await loadGeneralSettings(store)).theme).toBe('system');
  });

  it('merges a patch over the stored value and persists the versioned envelope', async () => {
    const store = createMemoryStore();
    await saveGeneralSettings({ theme: 'dark' }, store);
    await saveGeneralSettings({ panelFontSize: 'large' }, store);

    expect(store.dump[GENERAL_SETTINGS_STORAGE_KEY]).toEqual({
      version: 1,
      data: {
        theme: 'dark',
        panelFontSize: 'large',
        summaryInputExceedBehaviour: 'front',
        logLevel: 'warn',
      },
    });
  });

  it('leaves untouched fields alone when saving a single field', async () => {
    const store = createMemoryStore();
    await saveGeneralSettings({ theme: 'dark', logLevel: 'debug' }, store);

    // A patch must not carry defaults for the fields it does not mention, or
    // this call would reset `theme` back to 'system'.
    await saveGeneralSettings({ panelFontSize: 'small' }, store);

    expect(await loadGeneralSettings(store)).toEqual({
      theme: 'dark',
      panelFontSize: 'small',
      summaryInputExceedBehaviour: 'front',
      logLevel: 'debug',
    });
  });

  it('serialises concurrent patches so neither update is lost', async () => {
    const store = createMemoryStore();

    await Promise.all([
      saveGeneralSettings({ theme: 'dark' }, store),
      saveGeneralSettings({ logLevel: 'debug' }, store),
      saveGeneralSettings({ panelFontSize: 'small' }, store),
    ]);

    expect(await loadGeneralSettings(store)).toMatchObject({
      theme: 'dark',
      logLevel: 'debug',
      panelFontSize: 'small',
    });
  });
});
