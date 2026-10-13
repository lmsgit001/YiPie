import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  MIGRATION_VERSION,
  MODEL_CONFIGS_STORAGE_KEY,
  MODEL_CONFIGS_VERSION,
  STORED_KEYS,
  type StoredKeyDescriptor,
} from '@/contract';
import { runMigrations, type MigrationStep } from '@/platform/settings/migration-service';

import { createMemoryStore } from '../helpers/memory-store';

const SYNTHETIC_KEY = 'local:synthetic';

/** A key whose second version renames nothing but uppercases the payload. */
const SyntheticRecord = z.object({
  version: z.literal(2),
  data: z.object({ name: z.string() }),
});

/** The same key one version later, so a chain can be exercised end to end. */
const SyntheticRecordV3 = z.object({
  version: z.literal(3),
  data: z.object({ name: z.string() }),
});

const syntheticDescriptor: StoredKeyDescriptor = {
  key: SYNTHETIC_KEY,
  label: 'synthetic',
  currentVersion: 2,
  record: SyntheticRecord,
};

const step: MigrationStep = {
  id: 'synthetic-1-to-2',
  key: SYNTHETIC_KEY,
  from: 1,
  to: 2,
  migrate: (data) => ({ name: (data as { name: string }).name.toUpperCase() }),
};

const stepFor = (to: number, id = `synthetic-1-to-${to}`): MigrationStep => ({
  ...step,
  id,
  to,
  migrate: (data) => data,
});

describe('runMigrations', () => {
  it('reports every key as missing on a fresh install and writes nothing', async () => {
    const store = createMemoryStore();

    const report = await runMigrations(store);

    expect(report.version).toBe(MIGRATION_VERSION);
    expect(report.outcomes.map((outcome) => outcome.status)).toEqual(
      STORED_KEYS.map(() => 'missing'),
    );
    expect(store.dump).toEqual({});
  });

  it('leaves a key that is already current exactly as it was', async () => {
    const store = createMemoryStore();
    store.seed(MODEL_CONFIGS_STORAGE_KEY, {
      version: MODEL_CONFIGS_VERSION,
      data: { rows: [] },
    });
    const before = store.dump[MODEL_CONFIGS_STORAGE_KEY];

    const report = await runMigrations(store, [STORED_KEYS[1]!]);

    expect(report.outcomes[0]?.status).toBe('up-to-date');
    // Same object: "nothing to do" must mean no write at all.
    expect(store.dump[MODEL_CONFIGS_STORAGE_KEY]).toBe(before);
  });

  it('upgrades an old payload and records which steps ran', async () => {
    const store = createMemoryStore();
    store.seed(SYNTHETIC_KEY, { version: 1, data: { name: 'old' } });

    const report = await runMigrations(store, [syntheticDescriptor], [step]);

    expect(report.outcomes[0]).toMatchObject({
      status: 'upgraded',
      storedVersion: 1,
      appliedSteps: ['synthetic-1-to-2'],
    });
    expect(store.dump[SYNTHETIC_KEY]).toEqual({ version: 2, data: { name: 'OLD' } });
  });

  it('is idempotent: the second run applies nothing and writes nothing', async () => {
    const store = createMemoryStore();
    store.seed(SYNTHETIC_KEY, { version: 1, data: { name: 'old' } });

    await runMigrations(store, [syntheticDescriptor], [step]);
    const afterFirst = store.dump[SYNTHETIC_KEY];

    const second = await runMigrations(store, [syntheticDescriptor], [step]);

    expect(second.outcomes[0]).toMatchObject({ status: 'up-to-date', appliedSteps: [] });
    expect(store.dump[SYNTHETIC_KEY]).toBe(afterFirst);
  });

  it('applies a multi-step chain in order and lands on the wanted version', async () => {
    const store = createMemoryStore();
    store.seed(SYNTHETIC_KEY, { version: 1, data: { name: 'old' } });

    const thirdVersion: StoredKeyDescriptor = {
      ...syntheticDescriptor,
      currentVersion: 3,
      record: SyntheticRecordV3,
    };

    const report = await runMigrations(
      store,
      [thirdVersion],
      [
        {
          id: 'synthetic-1-to-2',
          key: SYNTHETIC_KEY,
          from: 1,
          to: 2,
          migrate: (data) => ({ name: (data as { name: string }).name + '2' }),
        },
        {
          id: 'synthetic-2-to-3',
          key: SYNTHETIC_KEY,
          from: 2,
          to: 3,
          migrate: (data) => ({ name: (data as { name: string }).name + '3' }),
        },
      ],
    );

    expect(report.outcomes[0]).toMatchObject({
      status: 'upgraded',
      appliedSteps: ['synthetic-1-to-2', 'synthetic-2-to-3'],
    });
    expect(store.dump[SYNTHETIC_KEY]).toEqual({ version: 3, data: { name: 'old23' } });
  });

  it('refuses to touch a payload written by a newer build', async () => {
    const store = createMemoryStore();
    const fromTheFuture = { version: 3, data: { name: 'newer' } };
    store.seed(SYNTHETIC_KEY, fromTheFuture);

    const report = await runMigrations(store, [syntheticDescriptor], [step]);

    expect(report.outcomes[0]).toMatchObject({ status: 'from-the-future', storedVersion: 3 });
    expect(store.dump[SYNTHETIC_KEY]).toBe(fromTheFuture);
  });

  it('reports a value that carries no version at all, without writing', async () => {
    const store = createMemoryStore();
    store.seed(MODEL_CONFIGS_STORAGE_KEY, 'not-an-envelope');

    const report = await runMigrations(store, [STORED_KEYS[1]!]);

    expect(report.outcomes[0]?.status).toBe('no-envelope');
    expect(report.outcomes[0]?.issues.length).toBeGreaterThan(0);
    expect(store.dump[MODEL_CONFIGS_STORAGE_KEY]).toBe('not-an-envelope');
  });

  it('applies nothing when the chain to the current version has a hole', async () => {
    const store = createMemoryStore();
    store.seed(SYNTHETIC_KEY, { version: 1, data: { name: 'old' } });

    const thirdVersion: StoredKeyDescriptor = { ...syntheticDescriptor, currentVersion: 3 };
    const report = await runMigrations(store, [thirdVersion], [stepFor(2)]);

    expect(report.outcomes[0]).toMatchObject({ status: 'no-path', storedVersion: 1 });
    // Half-migrating would leave a version no code understands; it stays put.
    expect(store.dump[SYNTHETIC_KEY]).toEqual({ version: 1, data: { name: 'old' } });
  });

  it('refuses to write when a step produces something unreadable', async () => {
    const store = createMemoryStore();
    const original = { version: 1, data: { name: 'old' } };
    store.seed(SYNTHETIC_KEY, original);

    const broken: MigrationStep = { ...step, id: 'synthetic-broken', migrate: () => 42 };
    const report = await runMigrations(store, [syntheticDescriptor], [broken]);

    expect(report.outcomes[0]).toMatchObject({
      status: 'output-invalid',
      appliedSteps: ['synthetic-broken'],
    });
    expect(report.outcomes[0]?.issues.length).toBeGreaterThan(0);
    expect(store.dump[SYNTHETIC_KEY]).toBe(original);
  });

  it('never moves a version backwards', async () => {
    const store = createMemoryStore();
    store.seed(SYNTHETIC_KEY, { version: 2, data: { name: 'current' } });

    const report = await runMigrations(store, [syntheticDescriptor], [step]);

    expect(report.outcomes[0]?.status).toBe('up-to-date');
  });
});
