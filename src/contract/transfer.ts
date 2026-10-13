import { z } from 'zod';

import { ModelConfig, ModelConfigsView } from './model-config';
import { classifyPromptConfigRows, PromptConfigsView } from './prompt-config';
import { Selection } from './selection';

import type { PromptConfig } from './prompt-config';

/**
 * The export file: a whole-configuration backup the user keeps, moves between
 * machines, or hands to themselves in a chat window.
 *
 * It is the one place this repo writes a *list* wholesale, and it does so for a
 * reason the change-only mutation surface does not cover: a restore is not an
 * edit, and the UI confirms it as the irreversible act it is. The rows inside are
 * still classified one by one, so an unfamiliar row costs one row, never the file.
 */

export const TRANSFER_FILE_TYPE = 'yipie-config';
export const TRANSFER_FILE_VERSION = 1;

export const TransferFile = z.object({
  type: z.literal(TRANSFER_FILE_TYPE),
  version: z.literal(TRANSFER_FILE_VERSION),
  exportedAt: z.string().min(1),
  /** Which build wrote the file, for the "this came from a newer version" message. */
  appVersion: z.string().min(1).optional(),
  selection: Selection,
  /** Classified on import; see `classifyTransferModelRows`. */
  models: z.array(z.unknown()),
  prompts: z.array(z.unknown()),
});

export type TransferFile = z.infer<typeof TransferFile>;

/**
 * A file this build produced, as opposed to one read from disk.
 *
 * `TransferFile` types the rows as `unknown[]` because that is what a file
 * contains until each row is classified. A file built here has already been
 * through the schemas, and callers (the export UI) should get that precision
 * instead of re-parsing their own output. It is assignable to `TransferFile`, so
 * both can be handed to preview / import.
 */
export interface BuiltTransferFile extends Omit<TransferFile, 'models' | 'prompts'> {
  models: ModelConfig[];
  prompts: PromptConfig[];
}

export const TransferExportOptions = z.object({
  /** Off by default: an export is a plain file in ~/Downloads or a chat window. */
  includeSecrets: z.boolean().default(false),
});

export type TransferExportOptions = z.infer<typeof TransferExportOptions>;

/**
 * `headers` is read leniently from a file: a hand-edited `{"x-retries": 3}` must
 * cost the user a header value, not the whole row. The dropped names are
 * reported through the `header-values-dropped` notice.
 *
 * This lives in the contract rather than in the import service on purpose — the
 * previous project's hand-written cleanup at the import edge is one of the two
 * accidents this repo exists to not repeat.
 */
const LenientHeaders = z
  .record(z.string(), z.unknown())
  // The default matters as much as the leniency: overriding `headers` wholesale
  // dropped the `{}` default `ModelConfig` carries, which made a file row that
  // simply omits `headers` fail to parse — a stricter import than storage, and
  // the wrong way round.
  .default({})
  .transform((raw) => {
    const headers: Record<string, string> = {};

    for (const [name, value] of Object.entries(raw)) {
      if (typeof value === 'string') headers[name] = value;
    }

    return headers;
  });

/** A model row as it arrives in a file. Everything but `headers` is strict. */
export const TransferModelRow = ModelConfig.extend({ headers: LenientHeaders });

export type TransferModelRow = z.infer<typeof TransferModelRow>;

export interface TransferExportInput {
  models: readonly ModelConfig[];
  prompts: readonly PromptConfig[];
  selection: Selection;
  /** Passed in rather than read from a clock here, so the file is reproducible in tests. */
  exportedAt: string;
  appVersion?: string;
}

/**
 * Build the file. Credentials are cleared unless the caller asked for them:
 * `apiKey`, `headers` and `extraBody` all leave the machine otherwise.
 */
export function buildTransferFile(
  input: TransferExportInput,
  options: TransferExportOptions = { includeSecrets: false },
): BuiltTransferFile {
  const includeSecrets = options.includeSecrets === true;

  const file: BuiltTransferFile = {
    type: TRANSFER_FILE_TYPE,
    version: TRANSFER_FILE_VERSION,
    exportedAt: input.exportedAt,
    selection: input.selection,
    models: input.models.map((model) =>
      includeSecrets ? model : { ...model, apiKey: '', headers: {}, extraBody: {} },
    ),
    prompts: input.prompts.map((prompt) => ({ ...prompt })),
  };

  return input.appVersion === undefined ? file : { ...file, appVersion: input.appVersion };
}

export type ParsedTransferFile = { ok: true; file: TransferFile } | { ok: false; error: string };

/**
 * Read a file the user picked, with messages that say what to do about it.
 *
 * A newer `version` is refused rather than coerced: a file from a later build can
 * hold fields this one would drop, and silently importing it would look like a
 * successful restore while losing exactly the parts that mattered.
 */
export function parseTransferFile(raw: unknown): ParsedTransferFile {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'This does not look like a Yipie configuration file.' };
  }

  const candidate = raw as { type?: unknown; version?: unknown };

  if (candidate.type !== TRANSFER_FILE_TYPE) {
    return {
      ok: false,
      error: `Expected a "${TRANSFER_FILE_TYPE}" file but found "${String(candidate.type)}".`,
    };
  }

  if (typeof candidate.version === 'number' && candidate.version > TRANSFER_FILE_VERSION) {
    return {
      ok: false,
      error: `This file was written by a newer version (file v${candidate.version}, this build reads v${TRANSFER_FILE_VERSION}). Update the extension first.`,
    };
  }

  const parsed = TransferFile.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: `This file is damaged: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}`,
    };
  }

  return { ok: true, file: parsed.data };
}

/** Structured, because the UI owns wording and OQ-3 commits to translation later. */
export const ImportNotice = z.discriminatedUnion('code', [
  z.object({ code: z.literal('models-skipped'), count: z.number().int().nonnegative() }),
  z.object({ code: z.literal('prompts-skipped'), count: z.number().int().nonnegative() }),
  z.object({ code: z.literal('header-values-dropped'), names: z.array(z.string()) }),
  z.object({ code: z.literal('unknown-variables'), names: z.array(z.string()) }),
  z.object({ code: z.literal('credentials-included'), count: z.number().int().nonnegative() }),
]);

export type ImportNotice = z.infer<typeof ImportNotice>;

export const TransferPreview = z.object({
  models: z.object({
    importable: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  prompts: z.object({
    importable: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  notices: z.array(ImportNotice),
});

export type TransferPreview = z.infer<typeof TransferPreview>;

export function classifyTransferModelRows(rows: readonly unknown[]): {
  models: ModelConfig[];
  unrecognized: unknown[];
} {
  const models: ModelConfig[] = [];
  const unrecognized: unknown[] = [];

  for (const row of rows) {
    const parsed = TransferModelRow.safeParse(row);
    if (parsed.success) models.push(parsed.data);
    else unrecognized.push(row);
  }

  return { models, unrecognized };
}

/** Header names whose value a file gave as something other than a string. */
export function findDroppedHeaderNames(row: unknown): string[] {
  if (typeof row !== 'object' || row === null) return [];
  const headers = (row as { headers?: unknown }).headers;
  if (typeof headers !== 'object' || headers === null) return [];

  return Object.entries(headers)
    .filter(([, value]) => typeof value !== 'string')
    .map(([name]) => name)
    .sort();
}

function hasCredentials(model: ModelConfig): boolean {
  return (
    model.apiKey !== '' ||
    Object.keys(model.headers).length > 0 ||
    Object.keys(model.extraBody).length > 0
  );
}

/**
 * What an import would do, without doing it — the numbers the confirmation
 * dialog shows, and the notices the result repeats.
 */
export function previewTransfer(file: TransferFile): TransferPreview {
  const models = classifyTransferModelRows(file.models);
  const prompts = classifyPromptConfigRows(file.prompts);

  const droppedHeaders = [...new Set(file.models.flatMap(findDroppedHeaderNames))].sort();

  // Only what a schema can decide. The `unknown-variables` notice is added by the
  // import service, which may import `domain/` and therefore reuse the one
  // template parser instead of a second copy of the pattern living here.
  const notices: ImportNotice[] = [];

  if (models.unrecognized.length > 0) {
    notices.push({ code: 'models-skipped', count: models.unrecognized.length });
  }
  if (prompts.unrecognized.length > 0) {
    notices.push({ code: 'prompts-skipped', count: prompts.unrecognized.length });
  }
  if (droppedHeaders.length > 0) {
    notices.push({ code: 'header-values-dropped', names: droppedHeaders });
  }

  const withCredentials = models.models.filter(hasCredentials).length;
  if (withCredentials > 0) {
    notices.push({ code: 'credentials-included', count: withCredentials });
  }

  return {
    models: { importable: models.models.length, skipped: models.unrecognized.length },
    prompts: { importable: prompts.prompts.length, skipped: prompts.unrecognized.length },
    notices,
  };
}

/** Rows sharing an id would make update / remove / move ambiguous. */
export function findDuplicateIds(rows: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.id)) duplicates.add(row.id);
    else seen.add(row.id);
  }

  return [...duplicates].sort();
}

export const TransferImportResult = z.object({
  models: ModelConfigsView,
  prompts: PromptConfigsView,
  selection: Selection,
  notices: z.array(ImportNotice),
});

export type TransferImportResult = z.infer<typeof TransferImportResult>;
