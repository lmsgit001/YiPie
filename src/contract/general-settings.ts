import { z } from 'zod';

/**
 * The single source of truth for general settings: the TypeScript type, the
 * runtime validation and the on-disk shape are all derived from this file.
 *
 * Schema-first is not decoration here. The project this replaces hand-wrote its
 * parsing, and paid for it twice: a settings write once deleted every record it
 * could not recognise (API keys included), and an import once reported success
 * while emptying the list. Both are shapes this file cannot express.
 */

/** Bumped only when a stored shape changes incompatibly; drives migrations. */
export const GENERAL_SETTINGS_VERSION = 1;

export const GENERAL_SETTINGS_STORAGE_KEY = 'local:general-settings';

export const ThemeMode = z.enum(['system', 'light', 'dark']);
export type ThemeMode = z.infer<typeof ThemeMode>;

export const PanelFontSize = z.enum(['small', 'medium', 'large']);
export type PanelFontSize = z.infer<typeof PanelFontSize>;

export const LogLevel = z.enum(['debug', 'info', 'warn', 'error', 'silent']);
export type LogLevel = z.infer<typeof LogLevel>;

/**
 * What to do when the page text will not fit the model's context window.
 * `nothing` means "send it anyway and let the provider reject it" — an explicit
 * user choice, not an error path.
 */
export const SummaryInputExceedBehaviour = z.enum(['front', 'middle', 'back', 'nothing']);
export type SummaryInputExceedBehaviour = z.infer<typeof SummaryInputExceedBehaviour>;

/**
 * Every field carries a default, so `z.infer` (the *output* type) is total while
 * `z.input` is partial. A record written by an older version that lacks a field
 * therefore reads back complete, instead of surfacing `undefined` into the UI.
 */
export const GeneralSettings = z.object({
  theme: ThemeMode.default('system'),
  panelFontSize: PanelFontSize.default('medium'),
  summaryInputExceedBehaviour: SummaryInputExceedBehaviour.default('front'),
  logLevel: LogLevel.default('warn'),
});

export type GeneralSettings = z.infer<typeof GeneralSettings>;
export type GeneralSettingsInput = z.input<typeof GeneralSettings>;

/**
 * A partial update as sent over the wire. Unknown keys are stripped, not trusted.
 *
 * This is spelled out field by field rather than derived with `.partial()`, and
 * the difference is not cosmetic: `.partial()` only makes a field optional, it
 * does not remove the field's default, so `GeneralSettings.partial().parse({})`
 * returns *every* default. A caller saving one switch would then silently reset
 * the other three, and an empty patch would be a factory reset. A patch must
 * mean "these fields, and nothing else".
 */
export const GeneralSettingsPatch = z.object({
  theme: ThemeMode.optional(),
  panelFontSize: PanelFontSize.optional(),
  summaryInputExceedBehaviour: SummaryInputExceedBehaviour.optional(),
  logLevel: LogLevel.optional(),
});
export type GeneralSettingsPatch = z.infer<typeof GeneralSettingsPatch>;

/**
 * The versioned envelope actually written to storage. Keeping the version next
 * to the payload (rather than in one global migration counter) is what lets a
 * single key migrate on its own.
 */
export const GeneralSettingsRecord = z.object({
  version: z.literal(GENERAL_SETTINGS_VERSION),
  data: GeneralSettings,
});

export type GeneralSettingsRecord = z.infer<typeof GeneralSettingsRecord>;

export function createDefaultGeneralSettings(): GeneralSettings {
  return GeneralSettings.parse({});
}
