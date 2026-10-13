# Changelog

## [Unreleased]

### 阶段 1 —— 契约与平台层补全

#### 模型配置

- `src/contract/model-config.ts`：`ModelConfig` 契约（类型 / 运行时校验 / 存储信封同源）+ `ModelConfigPatch`
  - 行的归类与回写（`classifyModelConfigRows` / `toStoredRows`）
- `src/contract/mutations.ts`：只暴露变更面（add / update / remove / move），不存在「整表覆盖」的方法
- `src/platform/settings/model-configs-service.ts`：读改写全部经单一写队列；认不出的行隔离到
  `unrecognized` 并原样写回；读不出来的数据只降级不覆盖
- RPC：`contract/rpc.ts` 登记 5 个方法，`platform/rpc/server.ts` 统一入参校验，`platform/rpc/client.ts` 校验返回
- 测试新增 21 个用例（契约 10 + 服务 11），全仓 41 个

#### Prompt 模板与默认项

- `src/contract/prompt-config.ts`：`PromptConfig` 契约 + 播种库（沿用旧项目那三份中文预设，助手名改为「一瞥」）
  - `PROMPT_VARIABLES`（只声明 pipeline 真能填的变量）
- `src/domain/prompt/template.ts`：`{{var}}` 子集的变量提取与「本构建填不了的名字」检查（OQ-4）
- `src/platform/settings/prompt-configs-service.ts`：读 / 变更 / 按 id 幂等播种；交互路径拒绝未知变量，
  导入路径只提示（新版本写的备份必须还能读）
- `src/contract/selection.ts` + `src/platform/settings/selection-service.ts`：默认项读写、悬空默认的
  读取时解析（`resolveDefaultId`）、列表收缩后的回退（`reconcileDefaults`，无变化就不写）
- 删除返回 `{ configs, selection }`，让 UI 能明确告知默认项被顶替成了哪个，而不是悄悄换掉

#### 迁移机制

- `src/contract/migration.ts` + `src/platform/settings/migration-service.ts`：逐 key 比较各自的信封版本——
  只前进、链上有洞就一步都不动、迁移产物必须先能被本构建读回，否则不写；不需要迁移时一次写都不发生
- 更高版本一律不覆盖（降级安装），进入「需要告知人」的集合；background 在 SW 启动时跑一次并记日志

#### 导入 / 导出

- `src/contract/transfer.ts` + `src/platform/settings/transfer-service.ts`：默认剔除 `apiKey` / `headers` /
  `extraBody`；文件里的行按宽松 `headers` 解析（一个坏值只损失它自己、不损失整行，且规则写在契约里）；
  全部行都认不出 → 整体拒绝；存储里已有的、读不懂的行保留；文件里的默认项按实际落地的行重新校准
- notice 是结构化的（code + 数字 / 名字），文案归 UI——OQ-3 承诺了阶段 6 的多语言

- 测试合计 128 个用例（15 个文件），RPC 共 20 个方法

### 修复

- **`import-x/no-restricted-paths` 此前一直空转**：默认解析器不认 `.ts`，也读不到 tsconfig 的 `@/*` 映射，
  而规则遇到解析不了的 import 会静默跳过——「反向依赖由 ESLint 拦截」实际没有拦截任何东西。补上
  `settings['import-x/resolver']`（扩展名含 `.ts` + `tsconfig.json`）后才真正生效
- 随之按 `import-x/order` 修正 6 个既有文件的导入顺序（仅顺序，无语义变化）
- 新增封口 zone：`features/**`、`options`、`popup`、`content` 不得直接 import 存储适配器，
  background 是唯一允许的装配点；用故意违规的探针文件验证过规则确实会报错

### 文档

- 新增 `docs/development-plan.md`：阶段 1–6 的交付物与验收标准、测试策略、数据契约与迁移策略、
  安全与隐私清单、体积预算、风险登记表与开放问题；README 的路线图改为本文摘要
- OQ-1～11 全部定案并记录决定（第 11 节）：只发 Release 附件、v1 不做 Firefox、多语言落 `zh_CN` + `en`、
  阶段 2 只做 `openai-compatible`、不做 KuaiKan 兼容导入器；按核对到的新证据修正阶段 2 的 provider
  spec 版本论证与「CORS 响应头注入被审核视为滥用」的表述，并新增 11.1 决定依据与已知限制

### 0.1.0 — walking skeleton

- 项目骨架：WXT + React 19 + TypeScript + Tailwind v4，`src/` 分层（contract / domain / platform / entrypoints）
- 契约优先：`src/contract` 用 zod 定义唯一事实来源，同时推导 TS 类型、运行时校验与存储信封版本
- 存储层：单队列写入（`platform/storage/tx.ts`）+ 读取三态（ok / missing / invalid），坏数据不再被静默覆盖
- 通信层：控制面 RPC 统一施加发送方信任校验与入参校验
- 工具链：Prettier + 类型感知 ESLint（含分层方向约束）+ Vitest + Playwright
- 首个纵切片：通用设置（主题 / 面板字号 / 超长裁剪策略）经 存储 → 后台 RPC → 设置页 全链路打通
