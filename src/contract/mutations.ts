import { z } from 'zod';

import { ModelConfig, ModelConfigPatch, ModelConfigsView } from './model-config';
import { PromptConfig, PromptConfigPatch, PromptConfigsView } from './prompt-config';
import { Selection } from './selection';

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

export const PromptConfigAddInput = PromptConfig;
export type PromptConfigAddInput = z.input<typeof PromptConfigAddInput>;

export const PromptConfigUpdateInput = z.object({
  id: z.string().min(1),
  patch: PromptConfigPatch,
});

export type PromptConfigUpdateInput = z.infer<typeof PromptConfigUpdateInput>;

export const PromptConfigRemoveInput = z.object({ id: z.string().min(1) });

export type PromptConfigRemoveInput = z.infer<typeof PromptConfigRemoveInput>;

export const PromptConfigMoveInput = z.object({
  id: z.string().min(1),
  /** Final index among the prompts; clamped to the list bounds. */
  toIndex: z.number().int().min(0),
});

export type PromptConfigMoveInput = z.infer<typeof PromptConfigMoveInput>;

/**
 * `null` is representable on purpose: "no default" is a real state (a fresh
 * install, an import whose default row was skipped), and a UI that had to fake
 * it with an empty string would be building the dangling value back.
 */
export const SetDefaultModelInput = z.object({
  id: z.string().min(1).nullable(),
});

export type SetDefaultModelInput = z.infer<typeof SetDefaultModelInput>;

export const SetDefaultPromptInput = z.object({
  id: z.string().min(1).nullable(),
});

export type SetDefaultPromptInput = z.infer<typeof SetDefaultPromptInput>;

/**
 * Removal is the one operation that can move a default, so it reports the
 * selection next to the list. That is how the UI gets to say "默认项已切换为 X"
 * instead of switching it behind the user's back.
 */
export const ModelConfigRemoveResult = z.object({
  configs: ModelConfigsView,
  selection: Selection,
});

export type ModelConfigRemoveResult = z.infer<typeof ModelConfigRemoveResult>;

export const PromptConfigRemoveResult = z.object({
  prompts: PromptConfigsView,
  selection: Selection,
});

export type PromptConfigRemoveResult = z.infer<typeof PromptConfigRemoveResult>;
