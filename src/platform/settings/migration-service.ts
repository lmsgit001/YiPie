import {
  EnvelopeProbe,
  MIGRATION_VERSION,
  STORED_KEYS,
  type KeyMigrationOutcome,
  type MigrationReport,
  type StoredKeyDescriptor,
} from '@/contract';
import { createLogger } from '@/platform/logger';
import { writeValidated } from '@/platform/storage/repo';
import { enqueue } from '@/platform/storage/tx';

import type { StorageLike } from '@/platform/storage/types';

const logger = createLogger('migration');

/**
 * One step of one key's history: "a payload written at `from` becomes `to`".
 *
 * The registry below is empty because no stored shape has changed yet. That is
 * not a placeholder: the runner, its reporting and its refusal paths are all
 * exercised today (a downgraded install and a damaged payload both take them),
 * and a step only has to be added when a schema actually changes.
 */
export interface MigrationStep {
  readonly id: string;
  readonly key: string;
  readonly from: number;
  readonly to: number;
  migrate(data: unknown): unknown;
}

export const MIGRATION_STEPS: readonly MigrationStep[] = [];

/**
 * The steps that take a stored version to the current one, in order — or null
 * when the chain has a hole.
 *
 * All-or-nothing on purpose: applying the part of a chain that exists would
 * leave the key at an intermediate version and report a half-migrated state,
 * which is worse than leaving it alone and saying so.
 */
function planChain(
  steps: readonly MigrationStep[],
  descriptor: StoredKeyDescriptor,
  from: number,
): MigrationStep[] | null {
  const chain: MigrationStep[] = [];
  let cursor = from;

  while (cursor < descriptor.currentVersion) {
    const step = steps.find(
      (candidate) => candidate.key === descriptor.key && candidate.from === cursor,
    );

    // `to > cursor` so a step that does not move forward cannot loop forever.
    if (!step || step.to <= cursor) return null;

    chain.push(step);
    cursor = step.to;
  }

  return chain;
}

function statusOnly(
  descriptor: StoredKeyDescriptor,
  status: KeyMigrationOutcome['status'],
  storedVersion: number | null,
  issues: string[] = [],
): KeyMigrationOutcome {
  return {
    key: descriptor.key,
    label: descriptor.label,
    status,
    storedVersion,
    appliedSteps: [],
    issues,
  };
}

async function migrateKey(
  store: StorageLike,
  descriptor: StoredKeyDescriptor,
  steps: readonly MigrationStep[],
): Promise<KeyMigrationOutcome> {
  const raw = await store.getItem(descriptor.key);
  if (raw === null || raw === undefined) return statusOnly(descriptor, 'missing', null);

  const envelope = EnvelopeProbe.safeParse(raw);
  if (!envelope.success) {
    return statusOnly(
      descriptor,
      'no-envelope',
      null,
      envelope.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
    );
  }

  const { version: storedVersion } = envelope.data;

  if (storedVersion === descriptor.currentVersion) {
    return statusOnly(descriptor, 'up-to-date', storedVersion);
  }

  // A newer payload than this build understands. Never overwritten: it is what a
  // downgraded install looks like, and the user's data is more current than us.
  if (storedVersion > descriptor.currentVersion) {
    return statusOnly(descriptor, 'from-the-future', storedVersion);
  }

  const chain = planChain(steps, descriptor, storedVersion);
  if (!chain) return statusOnly(descriptor, 'no-path', storedVersion);

  let data = envelope.data.data;
  for (const step of chain) data = step.migrate(data);

  const migrated = { version: descriptor.currentVersion, data };
  const validated = descriptor.record.safeParse(migrated);
  if (!validated.success) {
    // The step produced something this build cannot read back. Writing it would
    // destroy the old payload to leave a broken one behind.
    return {
      ...statusOnly(
        descriptor,
        'output-invalid',
        storedVersion,
        validated.error.issues.map(
          (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
        ),
      ),
      appliedSteps: chain.map((step) => step.id),
    };
  }

  await enqueue(() => writeValidated(store, descriptor.key, descriptor.record, validated.data));

  logger.info(`Migrated ${descriptor.label} from version ${storedVersion}`);

  return {
    key: descriptor.key,
    label: descriptor.label,
    status: 'upgraded',
    storedVersion,
    appliedSteps: chain.map((step) => step.id),
    issues: [],
  };
}

/**
 * Bring every stored key up to the version this build understands.
 *
 * Running it twice is safe and does nothing the second time (each key is compared
 * against its own version), which is what makes it reasonable to call at worker
 * start and from the settings page alike.
 */
export async function runMigrations(
  store: StorageLike,
  keys: readonly StoredKeyDescriptor[] = STORED_KEYS,
  steps: readonly MigrationStep[] = MIGRATION_STEPS,
): Promise<MigrationReport> {
  const outcomes: KeyMigrationOutcome[] = [];

  for (const descriptor of keys) {
    outcomes.push(await migrateKey(store, descriptor, steps));
  }

  return { version: MIGRATION_VERSION, outcomes };
}
