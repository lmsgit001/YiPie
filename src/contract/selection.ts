import { z } from 'zod';

/**
 * The selection state: which model and which prompt the user picked as the
 * default, plus the one-time seeding marker.
 *
 * It is one key rather than the three the previous project used, because all
 * three change together and an envelope per key would mean three writes that can
 * each be interrupted.
 */

export const SELECTION_VERSION = 1;

export const SELECTION_STORAGE_KEY = 'local:selection';

export const Selection = z.object({
  defaultModelId: z.string().min(1).nullable().default(null),
  defaultPromptId: z.string().min(1).nullable().default(null),
  /** Set once the built-in prompt library has been offered, so it is not re-added. */
  promptLibrarySeeded: z.boolean().default(false),
});

export type Selection = z.infer<typeof Selection>;

/** Field by field, with no defaults — see `GeneralSettingsPatch` for why. */
export const SelectionPatch = z.object({
  defaultModelId: z.string().min(1).nullable().optional(),
  defaultPromptId: z.string().min(1).nullable().optional(),
  promptLibrarySeeded: z.boolean().optional(),
});

export type SelectionPatch = z.infer<typeof SelectionPatch>;

export const SelectionRecord = z.object({
  version: z.literal(SELECTION_VERSION),
  data: Selection,
});

export type SelectionRecord = z.infer<typeof SelectionRecord>;

export function createDefaultSelection(): Selection {
  return Selection.parse({});
}

/**
 * Which id is actually in effect, given the ids that still exist.
 *
 * A stored default can point at a row that is gone — a concurrent removal, an
 * import that skipped an unreadable row, an interrupted write. Resolving it at
 * read time means no screen can render the blank state the previous project hit
 * ("the default model points at a deleted row"), whatever state storage is in.
 * `ids[0]` is the documented fallback: the list's first item.
 */
export function resolveDefaultId(current: string | null, ids: readonly string[]): string | null {
  if (current !== null && ids.includes(current)) return current;
  return ids[0] ?? null;
}

/**
 * Repair the defaults after a list changed, and say whether anything moved so
 * the caller can tell the user rather than switching their default silently.
 *
 * Only the lists the caller passes are considered — a removal of a model must
 * not be an excuse to touch the prompt default.
 */
export function reconcileSelection(
  selection: Selection,
  lists: { modelIds?: readonly string[]; promptIds?: readonly string[] },
): { selection: Selection; changed: boolean } {
  let next = selection;

  if (lists.modelIds) {
    next = { ...next, defaultModelId: resolveDefaultId(next.defaultModelId, lists.modelIds) };
  }
  if (lists.promptIds) {
    next = { ...next, defaultPromptId: resolveDefaultId(next.defaultPromptId, lists.promptIds) };
  }

  return {
    selection: next,
    changed:
      next.defaultModelId !== selection.defaultModelId ||
      next.defaultPromptId !== selection.defaultPromptId,
  };
}
