# Changelog

## [Unreleased]

### 模型配置（阶段 1 · 第一片）

- `src/contract/model-config.ts`：`ModelConfig` 契约（类型 / 运行时校验 / 存储信封同源）+ `ModelConfigPatch`
  - 行的归类与回写（`classifyModelConfigRows` / `toStoredRows`）
- `src/contract/mutations.ts`：只暴露变更面（add / update / remove / move），不存在「整表覆盖」的方法
- `src/platform/settings/model-configs-service.ts`：读改写全部经单一写队列；认不出的行隔离到
  `unrecognized` 并原样写回；读不出来的数据只降级不覆盖
- RPC：`contract/rpc.ts` 登记 5 个方法，`platform/rpc/server.ts` 统一入参校验，`platform/rpc/client.ts` 校验返回
- 测试新增 21 个用例（契约 10 + 服务 11），全仓 41 个

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
