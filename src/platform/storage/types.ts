/**
 * The narrow slice of a key/value store this project needs. Depending on this
 * interface rather than on the extension API directly is what lets the storage
 * logic be unit-tested in plain node — the browser-backed implementation is a
 * thin adapter (wxt-store.ts) that tests never load.
 */
export interface StorageLike {
  getItem(key: string): Promise<unknown>;
  setItem(key: string, value: unknown): Promise<void>;
  removeItem(key: string): Promise<void>;
}
