import { z } from 'zod';

/**
 * The single source of truth for prompt templates, shaped exactly like
 * `model-config.ts`: recognised rows are normalised, unrecognised rows are kept
 * whole, and the envelope carries its own version.
 */

export const PROMPT_CONFIGS_VERSION = 1;

export const PROMPT_CONFIGS_STORAGE_KEY = 'local:prompt-configs';

/**
 * The variables this build can fill (OQ-4: `{{variable}}` only).
 *
 * Only what the pipeline actually promises is listed. `currentSelection` and a
 * language variable exist in the project this replaces, but declaring them here
 * before anything fills them would be a lie the editor repeats to the user.
 * Adding one later is backward compatible: the schema stays permissive, so an
 * older row that mentions it is still readable, and the save-time typo check
 * simply starts accepting it.
 */
export const PROMPT_VARIABLES = ['articleUrl', 'textContent'] as const;

export type PromptVariable = (typeof PROMPT_VARIABLES)[number];

export const PromptConfig = z.object({
  /** The only handle the UI has for a later update / remove / move. */
  id: z.string().min(1),
  name: z.string().min(1),
  /** System message. Empty is allowed: a user template alone is valid. */
  systemTemplate: z.string().default(''),
  userTemplate: z.string().min(1),
});

export type PromptConfig = z.infer<typeof PromptConfig>;
export type PromptConfigInput = z.input<typeof PromptConfig>;

/**
 * A partial update as sent over the wire. Spelled out field by field, and with
 * no defaults — the same trap `ModelConfigPatch` documents: `.partial()` would
 * keep each field's default and a rename would blank the templates.
 */
export const PromptConfigPatch = z.object({
  name: z.string().min(1).optional(),
  systemTemplate: z.string().optional(),
  userTemplate: z.string().min(1).optional(),
});

export type PromptConfigPatch = z.infer<typeof PromptConfigPatch>;

/** See `ModelConfigsRecord`: `rows` is `unknown[]` so one bad row cannot damn the list. */
export const PromptConfigsRecord = z.object({
  version: z.literal(PROMPT_CONFIGS_VERSION),
  data: z.object({ rows: z.array(z.unknown()) }),
});

export type PromptConfigsRecord = z.infer<typeof PromptConfigsRecord>;

export const PromptConfigsView = z.object({
  prompts: z.array(PromptConfig),
  unrecognized: z.array(z.unknown()),
});

export type PromptConfigsView = z.infer<typeof PromptConfigsView>;

export function createEmptyPromptConfigsView(): PromptConfigsView {
  return { prompts: [], unrecognized: [] };
}

export function classifyPromptConfigRows(rows: readonly unknown[]): PromptConfigsView {
  const prompts: PromptConfig[] = [];
  const unrecognized: unknown[] = [];

  for (const row of rows) {
    const parsed = PromptConfig.safeParse(row);
    if (parsed.success) prompts.push(parsed.data);
    else unrecognized.push(row);
  }

  return { prompts, unrecognized };
}

export function toStoredPromptConfigRows(view: PromptConfigsView): unknown[] {
  return [...view.prompts, ...view.unrecognized];
}

/**
 * The prompt library seeded on first run.
 *
 * The three templates are the ones the project this replaces shipped, with the
 * assistant renamed to 一瞥（Yipie） — they are product copy, not code. They live
 * here as plain data: seeding copies them into storage once, after which they
 * belong to the user. One consequence is worth stating: because they are stored
 * data rather than UI strings, a later language pack cannot translate them
 * (see docs/development-plan.md OQ-3).
 */
export const DEFAULT_PROMPT_LIBRARY: readonly PromptConfig[] = [
  {
    id: 'preset-basic',
    name: '页面总结',
    systemTemplate: `你是一瞥（Yipie），网页总结助手。请用简体中文输出，严格依据网页原文，不编造原文没有的事实、数字或因果关系。

按以下结构输出：

## 核心结论

1-2 句话，直接说出最重要的结论。

## 关键要点

3-7 条项目符号，每条一个观点，加粗关键术语、数字和日期。

## 详细内容

按原文内容分小节展开。段落不超过 3 句，优先用列表；步骤用有序列表；对比用表格。

## 注意事项

仅在原文提到限制、风险或例外时输出。

规则：

- 不写「本文介绍了……」之类的空话，不重复结论。
- 原文没有说明的，写「原文未说明」，不要补充。
- 保留原文中的数字、日期、名称和限定条件。
- 需要佐证关键结论时，可在句末附 ⟦cite:原文中的短句⟧，短句必须照抄原文。`,
    userTemplate: `网页地址：
<Webpage URL>{{articleUrl}}</Webpage URL>

网页内容：
<Webpage Content>{{textContent}}</Webpage Content>`,
  },
  {
    id: 'preset-brief',
    name: '简要总结',
    systemTemplate: `请用简体中文输出极简的 Markdown 总结，严格依据原文，不编造。

按以下结构输出：

## 核心结论

1-2 句话。

## 关键要点

3-5 条项目符号，只保留最重要的事实、数字和条件。

原文提到风险或限制时，再加一个「## 注意事项」。需要佐证时，可在句末附 ⟦cite:原文中的短句⟧，短句必须照抄原文。`,
    userTemplate: `<网页内容>{{textContent}}</网页内容>`,
  },
  {
    id: 'preset-simplify',
    name: '简化解读',
    systemTemplate: `请用简体中文，以简单易懂但准确的语言解释网页内容，不编造原文没有的信息。

按以下结构输出：

## 核心结论

1-2 句话。

## 关键要点

用项目符号列出；复杂概念先说结论，再用一个简短例子解释。

原文提到风险或限制时，再加一个「## 注意事项」。你自己的解释要和原文事实分开写。需要佐证时，可在句末附 ⟦cite:原文中的短句⟧，短句必须照抄原文。`,
    userTemplate: `<内容>{{textContent}}</内容>`,
  },
];

/** What `prompt-configs.ensureLibrary` reports back. */
export const PromptLibrarySeedResult = z.object({
  seeded: z.boolean(),
  addedIds: z.array(z.string()),
});

export type PromptLibrarySeedResult = z.infer<typeof PromptLibrarySeedResult>;
