import { z } from 'zod';

import { ModelConfig, ModelConfigPatch } from './model-config';

/**
 * The mutation surface for the model list.
 *
 * The list is stored as a single object, so the obvious RPC — "here is the whole
 * array, save it" — would let two windows that loaded at different times
 * overwrite each other's additions. Each operation below is instead expressed as
 * a *change*, and the background applies it to a freshly read list inside the
 * single write queue. No method can replace the list, which is what makes that
 * class of lost update unrepresentable rather than merely discouraged.
 */

export const ModelConfigAddInput = ModelConfig;
export type ModelConfigAddInput = z.input<typeof ModelConfigAddInput>;

export const ModelConfigUpdateInput = z.object({
  id: z.string().min(1),
  patch: ModelConfigPatch,
});

export type ModelConfigUpdateInput = z.infer<typeof ModelConfigUpdateInput>;

export const ModelConfigRemoveInput = z.object({ id: z.string().min(1) });

export type ModelConfigRemoveInput = z.infer<typeof ModelConfigRemoveInput>;

export const ModelConfigMoveInput = z.object({
  id: z.string().min(1),
  /** Final index among the recognised configs; clamped to the list bounds. */
  toIndex: z.number().int().min(0),
});

export type ModelConfigMoveInput = z.infer<typeof ModelConfigMoveInput>;
