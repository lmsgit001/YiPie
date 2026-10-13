import { z } from 'zod';

import { GeneralSettings, GeneralSettingsPatch } from './general-settings';

/**
 * The control-plane contract. Both sides of the extension derive their types
 * from this table, and the background validates every incoming payload against
 * it — so a content script from a different build cannot hand the background a
 * shape it was not written for.
 *
 * `write: true` marks a method that mutates persistent state. Handlers for
 * those run inside the single storage queue (see platform/storage/tx.ts).
 */
export const rpcContract = {
  'settings.load': {
    input: z.void(),
    output: GeneralSettings,
  },
  'settings.save': {
    input: GeneralSettingsPatch,
    output: GeneralSettings,
  },
} as const;

export type RpcMethod = keyof typeof rpcContract;

/**
 * The shape `@webext-core/messaging` expects. Note the return types are the
 * *resolved* values: the library types `sendMessage` as `Promise<ReturnType>`,
 * so declaring `Promise<T>` here would double-wrap every call.
 */
export interface ProtocolMap {
  'settings.load': () => Promise<GeneralSettings>;
  'settings.save': (patch: GeneralSettingsPatch) => Promise<GeneralSettings>;
}
