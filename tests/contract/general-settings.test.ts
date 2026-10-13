import { describe, expect, it } from 'vitest';

import {
  GeneralSettings,
  GENERAL_SETTINGS_VERSION,
  GeneralSettingsPatch,
  GeneralSettingsRecord,
} from '@/contract';

describe('GeneralSettings schema', () => {
  it('fills every missing field with a default', () => {
    expect(GeneralSettings.parse({})).toEqual({
      theme: 'system',
      panelFontSize: 'medium',
      summaryInputExceedBehaviour: 'front',
      logLevel: 'warn',
    });
  });

  it('strips unknown keys instead of persisting them', () => {
    const parsed = GeneralSettings.parse({ theme: 'dark', injected: 'payload' });
    expect(parsed).not.toHaveProperty('injected');
  });

  it('rejects a value outside the enum', () => {
    expect(GeneralSettings.safeParse({ theme: 'neon' }).success).toBe(false);
  });

  it('rejects a record written by a different schema version', () => {
    const future = { version: GENERAL_SETTINGS_VERSION + 1, data: { theme: 'dark' } };
    expect(GeneralSettingsRecord.safeParse(future).success).toBe(false);
  });

  it('accepts an empty patch, so "save nothing" is not an error', () => {
    expect(GeneralSettingsPatch.parse({})).toEqual({});
  });
});
