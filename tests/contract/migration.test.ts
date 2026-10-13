import { describe, expect, it } from 'vitest';

import {
  EnvelopeProbe,
  GENERAL_SETTINGS_STORAGE_KEY,
  GENERAL_SETTINGS_VERSION,
  MIGRATION_VERSION,
  MODEL_CONFIGS_STORAGE_KEY,
  MODEL_CONFIGS_VERSION,
  outcomesNeedingAttention,
  PROMPT_CONFIGS_STORAGE_KEY,
  PROMPT_CONFIGS_VERSION,
  SELECTION_STORAGE_KEY,
  SELECTION_VERSION,
  STORED_KEYS,
} from '@/contract';

describe('the stored key registry', () => {
  it('covers every key this build persists, once', () => {
    const keys = STORED_KEYS.map((descriptor) => descriptor.key);

    expect(keys.sort()).toEqual(
      [
        GENERAL_SETTINGS_STORAGE_KEY,
        MODEL_CONFIGS_STORAGE_KEY,
        PROMPT_CONFIGS_STORAGE_KEY,
        SELECTION_STORAGE_KEY,
      ].sort(),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('states each key version as the constant its schema uses', () => {
    const versionOf = (key: string) =>
      STORED_KEYS.find((descriptor) => descriptor.key === key)?.currentVersion;

    expect(versionOf(GENERAL_SETTINGS_STORAGE_KEY)).toBe(GENERAL_SETTINGS_VERSION);
    expect(versionOf(MODEL_CONFIGS_STORAGE_KEY)).toBe(MODEL_CONFIGS_VERSION);
    expect(versionOf(PROMPT_CONFIGS_STORAGE_KEY)).toBe(PROMPT_CONFIGS_VERSION);
    expect(versionOf(SELECTION_STORAGE_KEY)).toBe(SELECTION_VERSION);
  });
});

describe('EnvelopeProbe', () => {
  it('reads a version without judging the payload', () => {
    // Content damage belongs to the owning service's read, which returns
    // `invalid` and refuses to overwrite; classifying versions is all this does.
    expect(EnvelopeProbe.parse({ version: 7, data: 'anything at all' })).toEqual({
      version: 7,
      data: 'anything at all',
    });
  });

  it('rejects a value that is not an envelope at all', () => {
    expect(EnvelopeProbe.safeParse('garbage').success).toBe(false);
    expect(EnvelopeProbe.safeParse({ version: '1', data: {} }).success).toBe(false);
    expect(EnvelopeProbe.safeParse({ data: {} }).success).toBe(false);
  });
});

describe('outcomesNeedingAttention', () => {
  const outcome = (status: string) => ({
    key: 'local:x',
    label: 'x',
    status,
    storedVersion: null,
    appliedSteps: [],
    issues: [],
  });

  it('selects exactly the outcomes a human has to be told about', () => {
    const report = {
      version: MIGRATION_VERSION,
      outcomes: [
        outcome('missing'),
        outcome('up-to-date'),
        outcome('upgraded'),
        outcome('from-the-future'),
        outcome('no-envelope'),
        outcome('no-path'),
        outcome('output-invalid'),
      ],
    } as never;

    expect(
      outcomesNeedingAttention(report).map((item) => (item as { status: string }).status),
    ).toEqual(['from-the-future', 'no-envelope', 'no-path', 'output-invalid']);
  });
});
