# AGENTS

## 调试约定

- **不要运行 `npm run dev`**：这是常驻进程，需要时通知用户手动操作
- 不要用浏览器自动化工具做交互式调试；端到端检查走 `npm run test:e2e`

## 闸门

提交前必须全绿：

```bash
npm run gate   # compile + test + lint
npm run build
```

CI（`.github/workflows/quality.yml`）在 push / PR 上重复这几步，并额外跑 e2e。

## 架构约束（这些是硬约束，不是建议）

### 1. 契约优先

`src/contract` 是唯一事实来源。每个持久化结构用 zod 定义一次，由它推导：

- TypeScript 类型（`z.infer`）
- 读取时的运行时校验
- 存储信封的版本号（`{ version, data }`）

**不要**在 `contract` 之外写解析/清洗函数。前一个项目的手写清洗函数造成过两次数据事故：
一次是写回时删掉了所有认不出的行（含 API Key），一次是导入时提示成功却清空了列表。

### 2. 分层单向依赖

```
contract → domain → platform → entrypoints
```

- `contract`：零依赖，只有 schema 与类型
- `domain`：纯函数，零环境依赖，必须能在 node 里 100% 单测
- `platform`：唯一允许 `import` 浏览器 API 的层（storage / rpc / logger）
- `entrypoints`：薄壳，只做装配

反向依赖由 ESLint 的 `import-x/no-restricted-paths` 拦截。

### 3. 存储只有一条写队列

所有持久化结构都是「整对象读改写」。写入必须经 `platform/storage` 的仓库函数，由
`tx.ts` 的单一队列串行化。**不要在别处再实现一个队列**——前一个项目有两份手写队列，
且仍有绕过它们的写入路径。

读取结果是三态：`ok` / `missing` / `invalid`。把 `invalid` 当成 `missing` 处理正是数据丢失的起点。

### 4. 每个 RPC 入口都校验

发送方信任校验（`sender.id === browser.runtime.id`）与入参 zod 解析由
`platform/rpc/server.ts` 统一施加。新增方法时在 `contract/rpc.ts` 登记，不允许 handler 自行跳过校验。

`write: true` 语义的方法必须在存储队列内执行。

### 5. 权限最小化

manifest 目前只有 `storage`。不要为了方便加 `<all_urls>` 或 `declarativeNetRequest`：

- 模型端点的 host 权限在用户添加模型配置时按 origin 用 `permissions.request()` 申请
- 内容脚本按需用 `scripting.executeScript` 注入，而不是在 manifest 里声明全站匹配

上架审核会把「给所有响应注入 CORS 头」这类做法视为权限滥用。

### 6. 不做精确分词

正文预算用 `domain/token-estimate.ts` 的保守近似（宁可多裁一点），真实用量取服务商返回的
`usage`。不要把 `gpt-tokenizer` 之类的词表打进 service worker——那会让 SW 冷启动解析 2MB+。
被服务商以超长拒绝时，自动按更小预算重试一次。

## 已知的取舍

| 取舍                              | 原因                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| TypeScript 停在 6.x 而非 7.x      | 最新 `typescript-eslint` 的 peer 范围是 `>=4.8.4 <6.1.0`；升级到原生 TS 7 就要放弃类型感知 lint，不划算。等上游放宽后重评 |
| ESLint 停在 9.x                   | `eslint-plugin-jsx-a11y` 尚未声明支持 ESLint 10                                                                           |
| 控制面用 `@webext-core/messaging` | 只做短 RPC；流式通道将来用 runtime port + 带版本握手的帧协议，两者不混用                                                  |
