import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readValidated, writeValidated } from '@/platform/storage/repo';

import { createMemoryStore } from '../helpers/memory-store';

const Schema = z.object({ version: z.literal(1), data: z.object({ theme: z.string() }) });

describe('validated storage repository', () => {
  it('reports a missing key as missing, not as invalid', async () => {
    const store = createMemoryStore();
    expect(await readValidated(store, 'local:x', Schema)).toEqual({ status: 'missing' });
  });

  it('reports an unreadable record as invalid and names the offending path', async () => {
    const store = createMemoryStore();
    store.seed('local:x', { version: 1, data: { theme: 7 } });

    const result = await readValidated(store, 'local:x', Schema);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.issues.join(' ')).toContain('data.theme');
    }
  });

  it('refuses to write a value that could not be read back', async () => {
    const store = createMemoryStore();
    await expect(
      writeValidated(store, 'local:x', Schema, { version: 1, data: { theme: 7 } } as never),
    ).rejects.toThrow(/unreadable value/);
    // The failed write must not have touched the key.
    expect(store.dump['local:x']).toBeUndefined();
  });

  it('round-trips a valid record', async () => {
    const store = createMemoryStore();
    await writeValidated(store, 'local:x', Schema, { version: 1, data: { theme: 'dark' } });
    expect(await readValidated(store, 'local:x', Schema)).toEqual({
      status: 'ok',
      value: { version: 1, data: { theme: 'dark' } },
    });
  });
});
