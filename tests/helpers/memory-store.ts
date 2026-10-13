import type { StorageLike } from '@/platform/storage/types';

export interface MemoryStore extends StorageLike {
  readonly dump: Record<string, unknown>;
  /** Seed a raw value, bypassing validation — as a corrupt record would arrive. */
  seed(key: string, value: unknown): void;
}

export function createMemoryStore(initial: Record<string, unknown> = {}): MemoryStore {
  const dump: Record<string, unknown> = { ...initial };

  return {
    dump,
    seed(key, value) {
      dump[key] = value;
    },
    // Promise-returning but not `async`: there is genuinely nothing to await
    // here, and `require-await` is right to say so.
    getItem: (key) => Promise.resolve(dump[key] ?? null),
    setItem: (key, value) => {
      dump[key] = value;
      return Promise.resolve();
    },
    removeItem: (key) => {
      delete dump[key];
      return Promise.resolve();
    },
  };
}
