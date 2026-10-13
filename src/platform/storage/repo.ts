import type { StorageLike } from './types';
import type { z } from 'zod';

/**
 * What a read can be. "invalid" is a first-class outcome rather than `null`, so
 * a caller has to decide what to do with data it cannot parse — the previous
 * implementation conflated it with "absent" and then overwrote it.
 */
export type ReadResult<T> =
  { status: 'ok'; value: T } | { status: 'missing' } | { status: 'invalid'; issues: string[] };

export async function readValidated<S extends z.ZodType>(
  store: StorageLike,
  key: string,
  schema: S,
): Promise<ReadResult<z.output<S>>> {
  const raw = await store.getItem(key);
  if (raw === null || raw === undefined) return { status: 'missing' };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'invalid',
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
      ),
    };
  }

  return { status: 'ok', value: parsed.data };
}

/**
 * Validate before persisting, so a value that cannot be read back can never be
 * written. Throws on invalid input: a write is a programming boundary, and
 * failing loudly here is cheaper than discovering the loss on the next read.
 */
export async function writeValidated<S extends z.ZodType>(
  store: StorageLike,
  key: string,
  schema: S,
  value: z.input<S>,
): Promise<z.output<S>> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Refusing to write an unreadable value to ${key}: ${issues}`);
  }

  await store.setItem(key, parsed.data);
  return parsed.data;
}
