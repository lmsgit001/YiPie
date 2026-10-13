import { z } from 'zod';

import {
  GENERAL_SETTINGS_STORAGE_KEY,
  GENERAL_SETTINGS_VERSION,
  GeneralSettingsRecord,
} from './general-settings';
import {
  MODEL_CONFIGS_STORAGE_KEY,
  MODEL_CONFIGS_VERSION,
  ModelConfigsRecord,
} from './model-config';
import {
  PROMPT_CONFIGS_STORAGE_KEY,
  PROMPT_CONFIGS_VERSION,
  PromptConfigsRecord,
} from './prompt-config';
import { SELECTION_STORAGE_KEY, SELECTION_VERSION, SelectionRecord } from './selection';

/**
 * Migration is per key, and this file is where the keys are enumerated.
 *
 * The per-key envelope version is authoritative (docs/development-plan.md §7): a
 * single global counter would let one key's change hold another's back, and would
 * say nothing about the shape of any individual payload. `MIGRATION_VERSION` is
 * only the build's own generation marker, for logs and for the report.
 */

export const MIGRATION_VERSION = 1;

/**
 * One stored key, plus the schema and version this build reads it with.
 *
 * `currentVersion` is not duplicated by hand: `record` is the very schema whose
 * `z.literal(...)` was built from the same constant, so the two cannot drift —
 * bumping a key means bumping its constant, which moves both.
 */
export interface StoredKeyDescriptor {
  readonly key: string;
  readonly label: string;
  readonly currentVersion: number;
  readonly record: z.ZodType;
}

export const STORED_KEYS: readonly StoredKeyDescriptor[] = [
  {
    key: GENERAL_SETTINGS_STORAGE_KEY,
    label: 'general settings',
    currentVersion: GENERAL_SETTINGS_VERSION,
    record: GeneralSettingsRecord,
  },
  {
    key: MODEL_CONFIGS_STORAGE_KEY,
    label: 'model configs',
    currentVersion: MODEL_CONFIGS_VERSION,
    record: ModelConfigsRecord,
  },
  {
    key: PROMPT_CONFIGS_STORAGE_KEY,
    label: 'prompt configs',
    currentVersion: PROMPT_CONFIGS_VERSION,
    record: PromptConfigsRecord,
  },
  {
    key: SELECTION_STORAGE_KEY,
    label: 'selection',
    currentVersion: SELECTION_VERSION,
    record: SelectionRecord,
  },
];

/**
 * Just enough of an envelope to read the version out of a key whose payload this
 * build may not understand at all. Deliberately not the key's own schema: the
 * point is to classify a *version*, and content damage is the owning service's
 * problem (its read returns `invalid` and refuses to overwrite).
 */
export const EnvelopeProbe = z.object({
  version: z.number().int(),
  data: z.unknown(),
});

export const MigrationStatus = z.enum([
  'missing',
  'up-to-date',
  'upgraded',
  'from-the-future',
  'no-envelope',
  'no-path',
  'output-invalid',
]);

export type MigrationStatus = z.infer<typeof MigrationStatus>;

export const KeyMigrationOutcome = z.object({
  key: z.string(),
  label: z.string(),
  status: MigrationStatus,
  storedVersion: z.number().int().nullable(),
  appliedSteps: z.array(z.string()),
  issues: z.array(z.string()),
});

export type KeyMigrationOutcome = z.infer<typeof KeyMigrationOutcome>;

export const MigrationReport = z.object({
  version: z.number().int(),
  outcomes: z.array(KeyMigrationOutcome),
});

export type MigrationReport = z.infer<typeof MigrationReport>;

/**
 * The outcomes a human has to be told about: data this build cannot read, data
 * from a newer build (a downgraded install), a missing step in the chain, or a
 * step that produced something unreadable. Everything else resolved itself.
 */
export function outcomesNeedingAttention(report: MigrationReport): KeyMigrationOutcome[] {
  return report.outcomes.filter(
    (outcome) =>
      outcome.status === 'from-the-future' ||
      outcome.status === 'no-envelope' ||
      outcome.status === 'no-path' ||
      outcome.status === 'output-invalid',
  );
}
