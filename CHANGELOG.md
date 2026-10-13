# Changelog

## [Unreleased]

### 0.1.0 — walking skeleton

- 项目骨架：WXT + React 19 + TypeScript + Tailwind v4，`src/` 分层（contract / domain / platform / entrypoints）
- 契约优先：`src/contract` 用 zod 定义唯一事实来源，同时推导 TS 类型、运行时校验与存储信封版本
- 存储层：单队列写入（`platform/storage/tx.ts`）+ 读取三态（ok / missing / invalid），坏数据不再被静默覆盖
- 通信层：控制面 RPC 统一施加发送方信任校验与入参校验
- 工具链：Prettier + 类型感知 ESLint（含分层方向约束）+ Vitest + Playwright
- 首个纵切片：通用设置（主题 / 面板字号 / 超长裁剪策略）经 存储 → 后台 RPC → 设置页 全链路打通
