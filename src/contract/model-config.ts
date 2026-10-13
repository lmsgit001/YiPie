import { z } from 'zod';

/**
 * The single source of truth for model configurations: the TypeScript type, the
 * runtime validation and the stored envelope all derive from this file, exactly
 * as `general-settings.ts` does for settings.
 *
 * Two different things are treated differently here, and the difference is the
 * point of the file:
 *
 *  - A *row* that does not match `ModelConfig` is never repaired and never
 *    dropped. It is set aside in `unrecognized` and written back verbatim. The
 *    project this replaces ran a hand-written cleanup on write and deleted every
 *    row it could not recognise, API keys included.
 *  - Unknown *keys inside* a row that does match are stripped, which is the
 *    contract-first behaviour `GeneralSettings` already has and a test pins. A
 *    row is therefore either recognised as a whole (and normalised) or preserved
 *    as a whole (and untouched); there is no state where half a row is rewritten.
 */

/** Bumped only when a stored shape changes incompatibly; drives migrations. */
export const MODEL_CONFIGS_VERSION = 1;

export const MODEL_CONFIGS_STORAGE_KEY = 'local:model-configs';

/**
 * v1 speaks exactly one wire protocol to providers: the OpenAI-compatible one.
 * `ollama` is a label for how its base URL is normalised, not a second
 * implementation — see docs/development-plan.md 4.3.
 */
export const ProviderId = z.enum(['openai-compatible', 'ollama']);
export type ProviderId = z.infer<typeof ProviderId>;

/**
 * Every field carries a default where a sensible one exists, so `z.infer` is
 * total: a record written by an older build reads back complete instead of
 * surfacing `undefined` into the UI.
 */
export const ModelConfig = z.object({
  /** The only handle the UI has for a later update / remove / move. */
  id: z.string().min(1),
  name: z.string().min(1),
  providerId: ProviderId.default('openai-compatible'),
  /** Origin plus path, e.g. `https://api.example.com/v1`. */
  baseURL: z.string().min(1),
  /**
   * Empty means "this endpoint needs no key" (a local server). Never logged and
   * never exported unless the user explicitly asks for credentials.
   */
  apiKey: z.string().default(''),
  modelId: z.string().min(1),
  headers: z.record(z.string(), z.string()).default({}),
  /**
   * Extra provider-specific request fields. Treated as sensitive as well: it is
   * user-authored JSON that the rest of the code never interprets.
   */
  extraBody: z.record(z.string(), z.unknown()).default({}),
  /** Left unset when the provider's own default should apply. */
  contextWindow: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export type ModelConfig = z.infer<typeof ModelConfig>;
export type ModelConfigInput = z.input<typeof ModelConfig>;

/**
 * A partial update as sent over the wire. Spelled out field by field rather than
 * derived with `.partial()`, for the same reason `GeneralSettingsPatch` is:
 * `.partial()` only makes a field optional, it does not drop the field's
 * default, so `ModelConfig.partial().parse({})` returns every default. An update
 * that only renames a model would then silently reset its endpoint, its headers
 * and its API key.
 */
export const ModelConfigPatch = z.object({
  name: z.string().min(1).optional(),
  providerId: ProviderId.optional(),
  baseURL: z.string().min(1).optional(),
  apiKey: z.string().optional(),
  modelId: z.string().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  extraBody: z.record(z.string(), z.unknown()).optional(),
  contextWindow: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export type ModelConfigPatch = z.infer<typeof ModelConfigPatch>;

/**
 * The versioned envelope actually written to storage.
 *
 * `rows` is typed `unknown[]` on purpose. Validating the rows here would turn
 * "one unreadable row" into "the whole list is unreadable", which is precisely
 * the failure that loses data: the list would be reported invalid, replaced by
 * an empty one, and the next save would persist that emptiness.
 */
export const ModelConfigsRecord = z.object({
  version: z.literal(MODEL_CONFIGS_VERSION),
  data: z.object({ rows: z.array(z.unknown()) }),
});

export type ModelConfigsRecord = z.infer<typeof ModelConfigsRecord>;

/** What the layers above storage see: the usable list, plus what was set aside. */
export const ModelConfigsView = z.object({
  models: z.array(ModelConfig),
  unrecognized: z.array(z.unknown()),
});

export type ModelConfigsView = z.infer<typeof ModelConfigsView>;

export function createEmptyModelConfigsView(): ModelConfigsView {
  return { models: [], unrecognized: [] };
}

/**
 * Split stored rows into the ones we understand and the ones we must keep as-is.
 * A row that fails `ModelConfig` is reported, not dropped; the caller decides
 * whether to log it, and storage keeps the original.
 */
export function classifyModelConfigRows(rows: readonly unknown[]): ModelConfigsView {
  const models: ModelConfig[] = [];
  const unrecognized: unknown[] = [];

  for (const row of rows) {
    const parsed = ModelConfig.safeParse(row);
    if (parsed.success) models.push(parsed.data);
    else unrecognized.push(row);
  }

  return { models, unrecognized };
}

/**
 * The inverse: recognised configs first, set-aside rows appended verbatim.
 *
 * The set-aside rows keep their content but not their position relative to the
 * configs. That position is not observable — they are never rendered, and `move`
 * only reorders configs — while the thing that does matter is pinned by a test:
 * writing the list back cannot lose one.
 */
export function toStoredRows(view: ModelConfigsView): unknown[] {
  return [...view.models, ...view.unrecognized];
}

/**
 * What the "add a model" form needs to know about a provider, and the shortcuts
 * it offers, live here rather than in the UI: they are product data, and the
 * export / import path already treats stored configs as the source of truth.
 *
 * Every entry below speaks the same OpenAI-compatible protocol — v1 has exactly
 * one wire protocol (OQ-7), so a preset is a label plus a base URL and adding
 * one attaches no code path. That is also why this table does not belong in the
 * roadmap's "add a provider" category: there is nothing to implement.
 *
 * The labels are UI text shipped as data, the same tradeoff the seeded prompt
 * library makes (see prompt-config.ts): proper nouns mostly need no translation,
 * and phase 6 can move them into `_locales` if it turns out they do.
 */
export const ProviderInfo = z.object({
  label: z.string().min(1),
  /** Drives the form's "leave empty for a local server" hint, not enforcement. */
  requiresApiKey: z.boolean(),
  defaultBaseURL: z.string().min(1),
});

export type ProviderInfo = z.infer<typeof ProviderInfo>;

export const PROVIDER_INFO: Record<ProviderId, ProviderInfo> = {
  'openai-compatible': {
    label: 'OpenAI 兼容',
    requiresApiKey: true,
    defaultBaseURL: 'https://api.openai.com/v1',
  },
  ollama: {
    label: 'Ollama（本地）',
    requiresApiKey: false,
    defaultBaseURL: 'http://localhost:11434/v1',
  },
};

export const BaseURLPreset = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  providerId: ProviderId,
  baseURL: z.string().min(1),
});

export type BaseURLPreset = z.infer<typeof BaseURLPreset>;

/**
 * A short, curated list rather than the forty-odd endpoints the previous project
 * shipped: every entry costs bytes in the background bundle, and the first field
 * is editable — a preset is a starting point, not a whitelist.
 */
export const BASE_URL_PRESETS: readonly BaseURLPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    providerId: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    providerId: 'openai-compatible',
    baseURL: 'https://api.deepseek.com/v1',
  },
  {
    id: 'moonshot-cn',
    label: 'Kimi（月之暗面）',
    providerId: 'openai-compatible',
    baseURL: 'https://api.moonshot.cn/v1',
  },
  {
    id: 'moonshot-intl',
    label: 'Kimi Global',
    providerId: 'openai-compatible',
    baseURL: 'https://api.moonshot.ai/v1',
  },
  {
    id: 'zhipu',
    label: '智谱 BigModel',
    providerId: 'openai-compatible',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  },
  {
    id: 'dashscope-cn',
    label: '阿里云百炼',
    providerId: 'openai-compatible',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    id: 'dashscope-intl',
    label: '阿里云百炼（国际）',
    providerId: 'openai-compatible',
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  },
  {
    id: 'volcengine',
    label: '火山引擎方舟',
    providerId: 'openai-compatible',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    providerId: 'openai-compatible',
    baseURL: 'https://api.siliconflow.cn/v1',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    providerId: 'openai-compatible',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'groq',
    label: 'Groq',
    providerId: 'openai-compatible',
    baseURL: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio（本地）',
    providerId: 'openai-compatible',
    baseURL: 'http://localhost:1234/v1',
  },
  {
    id: 'ollama-local',
    label: 'Ollama（本地）',
    providerId: 'ollama',
    baseURL: 'http://localhost:11434/v1',
  },
];
