import { storage, type StorageItemKey } from 'wxt/utils/storage';

import type { StorageLike } from './types';

const asKey = (key: string) => key as StorageItemKey;

/**
 * The only place in the codebase that talks to the browser storage API. Note it
 * exposes no `setItem` shortcut to feature code: writes go through the
 * repository, which validates, and through the queue in tx.ts, which serialises.
 */
export const wxtStore: StorageLike = {
  getItem: (key) => storage.getItem<unknown>(asKey(key)),
  setItem: (key, value) => storage.setItem(asKey(key), value),
  removeItem: (key) => storage.removeItem(asKey(key)),
};
