# 一瞥 Yipie · 开发计划

> **状态**：阶段 0 已完成并验证；阶段 1 待启动（OQ-1～11 已定案，见第 11 节）
> **权威性**：本文档是路线图的唯一权威来源。`README.md` 的路线图表格、`CHANGELOG.md` 的条目都是摘要，与本文冲突时以本文为准。
> **维护规则**：调整阶段划分、交付物或验收标准，必须在本文内改，并在附录 D 记一行；不要只改 README。

## 1. 产品定义

把当前网页交给**你自己配置的大模型**，拿回一份可以直接读的总结。

| 项目     | 决定                                                                           |
| -------- | ------------------------------------------------------------------------------ |
| 形态     | Chrome / Edge（Manifest V3）浏览器扩展；Firefox 兼容见 OQ-2                    |
| 数据流向 | 浏览器 →（用户自己的）模型服务商。没有中间服务器                               |
| 凭据     | 用户自己的 API Key，只存在 `browser.storage.local`，不入日志、不随导出默认外传 |
| 遥测     | 无。不埋点、不上报崩溃                                                         |
| 成本     | 零服务端成本；token 由用户自付                                                 |

### 1.1 可验证的目标（不是口号）

1. 安装时**零站点权限**：manifest 的 `permissions` 只有 `storage`；站点访问权在用户添加模型时按 origin 现申请。
2. service worker 冷启动**不解析大体积词表**：`background.js` 预算 < 150 kB（阶段 0 实测 77.90 kB）。
3. 每个持久化结构**都有 schema 与迁移路径**：坏数据可诊断、不可静默覆盖，删除永远是显式用户操作。
4. 阶段 4 之后，E2E 能在真实 Chromium 里跑通「打开页面 → 触发总结 → 流式输出 → 刷新页面后恢复对话」。
5. 显示给用户的 token 用量来自服务商返回的 `usage`，不是本地估算。

### 1.2 非目标

- 账号体系、云同步、团队协作、分享链接
- 服务端代理（不代付 token、不隐藏来源 IP）
- 精确分词（理由见 `AGENTS.md`「不做精确分词」；如需精确，走 offscreen document，见 OQ-9）
- 移动端 / 桌面端 / 浏览器以外的形态
- 为了「所有站点都能注入」而索取 `<all_urls>`
- 原生 Anthropic / Google provider（`@ai-sdk/anthropic` / `@ai-sdk/google`）：v1 只做 `openai-compatible` 一家，Claude / Gemini 经 OpenRouter 这类兼容端点使用（OQ-7）

### 1.3 与旧项目 KuaiKan 的关系

yipie 是**重写**，不是分支：产品形态（网页总结扩展）保留，架构推翻重来。继承的是踩坑清单，不继承代码。

旧项目仍然可用，但带着几个已知事故——它们正是本仓硬约束的来源：

| 旧项目的问题                                         | yipie 的对应约束                                       |
| ---------------------------------------------------- | ------------------------------------------------------ |
| 手写清洗函数在写回时删掉所有认不出的行（含 API Key） | 契约优先；宽容读取 + 原样保留；删除必须显式            |
| 两份手写写队列，且仍有绕过它们的写入路径             | 只有一条写队列（`platform/storage/tx.ts`），并封死旁路 |
| `background.js` 2.6 MB，冷启动解析 2.22 MB 词表      | 近似估算 + 体积预算（第 9 节）                         |
| `.output` 里的 manifest 落后源码两个版本没人发现     | 发版流程含产物校验（阶段 6）                           |

**不做**「从 KuaiKan 迁移已有配置」的导入器（OQ-8 已定）：yipie 只提供自己的导入 / 导出（备份与搬迁），不解析旧项目的导出 JSON，配置由用户手工重建。

## 2. 架构基线（硬约束及其强制手段）

这些不是建议，是 CI 会拦下来的东西。改动前先读 `AGENTS.md`。

| 约束           | 落地位置                                     | 由什么强制                                                            |
| -------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| 契约优先       | `src/contract/**`                            | zod schema 同时推导类型、读写校验、存储信封版本                       |
| 分层单向依赖   | `contract → domain → platform → entrypoints` | ESLint `import-x/no-restricted-paths`（反向依赖直接报错）             |
| 单一写队列     | `src/platform/storage/tx.ts`                 | 仓库写函数内部 `enqueue`（阶段 1 再加一条封口规则，见 4.2）           |
| RPC 全校验     | `src/platform/rpc/server.ts`                 | 信任校验 + 入参 zod 解析统一施加，handler 不能绕过                    |
| 权限最小化     | `wxt.config.ts` 的 `manifest`                | 只声明 `storage`；站点权限运行时按 origin 申请（阶段 2）              |
| 不做精确分词   | `src/domain/token-estimate.ts`               | 保守近似 + 服务商 `usage`                                             |
| 只读控制面可测 | `platform/storage/types.ts` 的 `StorageLike` | 业务逻辑依赖窄接口，测试用内存实现（`tests/helpers/memory-store.ts`） |

## 3. 阶段总览

规模是相对量级（S ≈ 一个纵切片，M ≈ 数个纵切片，L ≈ 需要多轮迭代），不是工时承诺。

| 阶段 | 主题                  | 关键交付物                                                                                          | 规模 | 需要你手工验证          | 状态   |
| ---- | --------------------- | --------------------------------------------------------------------------------------------------- | ---- | ----------------------- | ------ |
| 0    | 走骨架                | 分层架构、契约层、存储层、RPC 控制面、工具链与 CI                                                   | S    | 否                      | ✅     |
| 1    | 契约与平台层补全      | 模型配置 / Prompt 模板 / 默认选择的 schema、变更面 RPC、迁移机制、导入导出                          | M    | 否                      | 待启动 |
| 2    | Provider 与权限       | `createLanguageModelFromConfig`（仅 `openai-compatible`）、按 origin 申请权限、错误映射、usage 采集 | M    | 是（真实 API Key 一次） | 未开始 |
| 3    | 流式通道              | runtime port 桥、带版本握手的帧协议、abort 与清理、DEV-only 计时帧                                  | M    | 是（真实总结一次）      | 未开始 |
| 4    | 内容脚本与面板        | 正文提取管线、近似预算与裁剪、Shadow DOM 面板、快照恢复、右键菜单                                   | L    | 否（E2E 可覆盖）        | 未开始 |
| 5    | 设置页与 popup 完整化 | 模型 / Prompt CRUD UI、导入导出 UI、通用设置、日志级别                                              | M    | 部分                    | 未开始 |
| 6    | 硬化与分发            | 无障碍与 i18n、体积与权限审计、隐私政策与逐权限说明、发版流程、Release 附件                         | M    | 是（发布前冒烟一次）    | 未开始 |

依赖顺序是线性的：1 → 2 → 3 → 4 → 5 → 6。阶段 1 与阶段 2 之间可以并行推进一部分（2 的纯 domain 部分 `base-url.ts` 不依赖 1 的存储改动），但**提交仍按阶段走**，避免一个提交里混两类风险。

每个阶段结束时必须能回答三个问题：这阶段证明了什么？怎么复现？还剩什么没做？

## 4. 阶段详情

### 4.1 阶段 0 —— 走骨架（已完成）

**目标**：证明这套架构能跑通一根真实纵切片，而不是先铺一堆空目录。

**交付物**

```
src/contract/      general-settings.ts · rpc.ts · index.ts
src/domain/        token-estimate.ts
src/platform/      storage/{types,repo,tx,wxt-store}.ts · rpc/{messaging,server,client,trust}.ts
                   settings/general-settings-service.ts · logger/index.ts
src/entrypoints/   background/index.ts · options/* · popup/*
tests/             4 个测试文件 / 20 个用例
e2e/               smoke.spec.ts（真实 Chromium 加载扩展）
```

**证明了的结论**

- 「存储 → 后台 RPC → 设置页」全链路可用，且刷新后仍在（E2E 断言过）
- 契约优先可落地：一个 schema 同时给出类型、读写校验、信封版本
- 写队列能防丢更新（有测试）；读取三态让坏数据可诊断
- 工具链与四门闸（compile / test / lint / format）在 CI 里可重复

**测试抓到的两个真缺陷**（保留在 CHANGELOG 里，作为「为什么要测试」的证据）

1. `GeneralSettings.partial()` 会保留字段默认值 —— 保存任意一个开关会静默重置另外三个，空 patch 等于恢复出厂设置。改成逐字段显式 optional。
2. 原先的 emoji 断言区分不了「按码点迭代」和「按 UTF-16 单元迭代」（两种写法都算出 1）。换成 100 个 emoji 的断言才真正覆盖。

**进入阶段 1 的前提**：`npm run gate` 与 `npm run build` 全绿（本文件附录 C 有当日复跑的记录）。

### 4.2 阶段 1 —— 契约与平台层补全

**目标**：把「用户配置」这个领域（模型配置、Prompt 模板、默认选择）的契约与存储语义补齐，让后续所有 UI 只负责渲染，不含业务判断。

**新增文件**

| 文件                                              | 内容                                                                                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/contract/model-config.ts`                    | `ModelConfig`（id / 名称 / providerId / baseURL / apiKey / modelId / headers / extraBody / contextWindow / maxOutputTokens / temperature）、provider 描述表、快捷 URL preset |
| `src/contract/prompt-config.ts`                   | `PromptConfig`（id / 名称 / system 模板 / user 模板 / 可用变量声明）                                                                                                         |
| `src/contract/selection.ts`                       | 默认模型 id、默认 Prompt id、Prompt 库播种标记                                                                                                                               |
| `src/contract/mutations.ts`                       | 变更操作的入参形状：`add` / `update` / `remove` / `move` / `setDefault`                                                                                                      |
| `src/contract/migration.ts`                       | `MIGRATION_VERSION` 与迁移描述表                                                                                                                                             |
| `src/platform/settings/model-configs-service.ts`  | 模型列表的读 / 变更 / 导入导出                                                                                                                                               |
| `src/platform/settings/prompt-configs-service.ts` | Prompt 列表的读 / 变更 / 播种                                                                                                                                                |
| `src/platform/settings/selection-service.ts`      | 默认项的读写与「默认项被删除」时的回退                                                                                                                                       |
| `src/platform/settings/migration-service.ts`      | 幂等迁移执行器                                                                                                                                                               |

`platform/rpc/server.ts` 与 `client.ts` 同步扩展，新增方法一律先在 `contract/rpc.ts` 登记。

**关键设计决定（每条都对应一次旧项目的事故）**

1. **只暴露变更面，不暴露「整表覆盖」。** RPC 方法接受 `add / update / remove / move / setDefault`，由后台在写队列内「读全量 → 改 → 写全量」。设置页不再拥有「把整个数组传回去」的能力，也就不可能把并发期间新增的行覆盖掉。
2. **宽容读取 + 原样保留。** 列表里认不出的行不丢弃、不静默删除，被隔离在 `unrecognized` 而不是混进业务数组；下次写回时原样保留。导入时若**所有**行都认不出，整体拒绝并报错——不做「部分成功」的假象。
3. **凭据边界。** 导出 JSON 默认剔除 `apiKey` 与 `headers`；要带凭据必须显式勾选确认。导入时同样校验类型（`headers` 的值必须是字符串，非法值剔除并提示）。
4. **写路径封口。** 用 ESLint 规则禁止 `entrypoints/**` 与未来的 `features/**` 直接 import `platform/storage/wxt-store`：绕过队列的写法在**写代码时**就报错，而不是靠 review 发现。这条挂在 `import-x/no-restricted-paths` 的 zones 上。
5. **迁移是逐 key 的、幂等的、只前进。** 每个 key 自带版本信封（阶段 0 已定），迁移器只在 `MIGRATION_VERSION` 落后时执行；重复执行结果相同；不认识的更高版本不覆盖，而是提示用户（降级安装场景）。
6. **默认项回退。** 删除当前默认模型 / Prompt 时，回退到列表首项并明确告知，而不是留下一个悬空 id（旧项目出现过「默认模型指向已删除行」的空白状态）。

**任务清单**

- [ ] 三个契约文件 + `contract/index.ts` 汇总导出
- [ ] 列表变更语义（add / update / remove / move / setDefault）与 patch 语义的单测
- [ ] 三个 service + 迁移器，全部走 `enqueue` 队列
- [ ] RPC 方法登记 + 服务端入参校验 + 客户端返回校验
- [ ] 导入 / 导出（含「剔除凭据」与「全坏则拒绝」两条测试）
- [ ] ESLint 封口规则 + 一条故意违规的自测（临时文件，验证规则确实生效后删除）
- [ ] `README.md` 当前状态、`CHANGELOG.md` 对应条目

**验收标准**

- [ ] `npm run gate` 与 `npm run build` 全绿，新增行为各有测试，测试文件命名与 `tests/` 现有结构一致
- [ ] 列表里塞一条 `{"foo":1}` 的脏行后：读取不炸、UI 不显示它、写回后它仍在
- [ ] 保存单个字段不会影响其它字段（阶段 0 的同类回归测试扩展到列表语义）
- [ ] 迁移器跑两次结果一致（幂等断言）
- [ ] `wxt-store` 只在 `platform/storage/**` 被引用（ESLint 断言）

### 4.3 阶段 2 —— Provider 与权限

**目标**：把一条模型配置变成可以真正发起请求的客户端，并且**只为用户配置过的端点**申请权限。

**新增文件**

| 文件                             | 内容                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/domain/model/base-url.ts`   | `normalizeOllamaBaseURL`、`findBaseURLPreset`（纯函数：host 匹配、忽略协议 / 大小写 / 尾斜杠 / `/v1` 等路径差异） |
| `src/domain/model/errors.ts`     | 错误分类（鉴权 / 配额 / 限流 / 网络 / 超长 / 未知）与用户可读文案、是否可重试                                     |
| `src/platform/model/provider.ts` | `createLanguageModelFromConfig(config)`                                                                           |
| `src/platform/model/policy.ts`   | 按 origin 申请 / 回收 host 权限，origin 归一化                                                                    |
| `src/platform/model/usage.ts`    | 从流结束事件取出 `usage` 并归一成统一结构                                                                         |

**关键设计决定**

1. **`providerId: 'ollama'` 走 OpenAI 兼容端点**，base URL 统一成 `.../v1`，读取时就把旧式 `.../api` 就地改写。理由：`ollama-ai-provider` 停在 specification v1，不属于 AI SDK 6 的目标版本（v3）——官方排错文档里那个 `AI_UnsupportedModelVersionError` 案例是**对着 AI SDK 5** 的（AI SDK 5 要求 v2），AI SDK 6 的精确异常官方并未写明，所以本条不引用未验证的异常。换包也不通：`ollama-ai-provider-v2` 当前的 `latest`（4.0.1）面向 AI SDK 7 / Provider V4，明确不支持 5 / 6。**不引入 spec v1 的 provider 包**，断言写成「provider 的 spec 版本 ≥ v2」——注意 `@ai-sdk/openai-compatible` 目前是 **2.x（v2 spec）**，在 AI SDK 6 下走 compatibility mode（社区 issue #12615 记录过相关警告），因此 `ai` 与各 `@ai-sdk/*` 必须**锁定精确版本**，不用 `latest`。
2. **`extraBody` / `headers` 经 provider 的自定义 fetch 合并**，不改造全局 `fetch`，避免影响扩展内其它请求。
3. **权限按需、可回收**：添加模型时对目标 origin 调 `permissions.request({ origins })`；删除配置时尝试回收。申请失败**不阻塞保存**，而是把该模型标成「缺少访问权限」并在使用时可一键重试——用户可能只是暂时拒绝了弹窗。
4. **不做自动重试风暴**：只有明确的「瞬时」错误（429 / 5xx / 网络）才重试一次；鉴权错误直接呈现服务商原文摘要，不猜。
5. **凭据不进日志**：日志脱敏规则与错误映射放在同一处，避免两套规则漂移。
6. **provider 覆盖面（OQ-7 已定）**：v1 只做 `openai-compatible` 一家，原生 Anthropic / Google 不做（列在 1.2 非目标）。加 provider 之前先量 `background.js` 的体积增量：provider 包直接进后台，预算是 150 kB，阶段 0 只用了 77.90 kB。

**验收标准**

- [ ] URL 归一化与 preset 匹配的纯函数单测（含 `.../api` → `.../v1`、尾斜杠、大小写、同 host 不同路径的多个 preset）
- [ ] 请求体构造单测：`extraBody` 合并、`headers` 值非字符串时被剔除
- [ ] 错误映射单测：401 / 403 / 429 / 5xx / 超时 / 网络中断各有独立断言
- [ ] 一条真实调用（**需要你提供 Key 并手工执行一次**；我不会读取或写入你的密钥）
- [ ] `manifest.json` 仍未出现 `host_permissions` 静态声明
- [ ] provider spec 版本断言（≥ v2），且 `ai` 与各 `@ai-sdk/*` 锁定精确版本（不用 `latest`）

### 4.4 阶段 3 —— 流式通道

**目标**：把「流式总结」这条高频路径做对：协议有版本、取消有语义、端口断开有清理。

**新增文件**

| 文件                               | 内容                                                          |
| ---------------------------------- | ------------------------------------------------------------- |
| `src/contract/stream-protocol.ts`  | `PROTOCOL_VERSION`、`ClientFrame` / `ServerFrame` 的 zod 定义 |
| `src/platform/stream/bridge.ts`    | 后台侧：注册 port、握手、逐帧转发                             |
| `src/platform/stream/transport.ts` | 页面侧：AI SDK 的自定义 transport，与 `useChat` 对接          |

**帧协议（草案，实现时以 `contract/stream-protocol.ts` 为准）**

```ts
ClientFrame =
  | { type: 'hello'; protocolVersion: number }
  | { type: 'send-messages'; requestId: string; chatId: string; messages: UIMessage[] }
  | { type: 'abort'; requestId: string }

ServerFrame =
  | { type: 'ready'; protocolVersion: number }
  | { type: 'chunk'; chunk: UIMessageChunk }
  | { type: 'error'; message: string; retryable: boolean }
  | { type: 'done'; usage?: Usage }
  | { type: 'timing'; marks: Record<string, number>; final: boolean }   // 仅 DEV 构建发送
```

**关键设计决定**

1. **握手先行**：页面先发 `hello`，后台回 `ready` 或明确的版本不匹配错误。扩展更新后仍开着的旧页面会拿到**一个清晰的错误**，而不是解析到一半才崩。
2. **控制面与数据面分离**：短 RPC 走 `@webext-core/messaging`，流式走 runtime port。两者不互相承载，避免把流塞进消息通道。
3. **取消是一等公民**：`abort` 帧 → 后台 `AbortController.abort()` → 停止读取上游并释放 port；页面关闭 / 端口断开时同样清理，不留孤儿请求。
4. **同一标签页同时只允许一条流**：新请求先终止旧的（或明确拒绝），避免两个流往同一面板写。
5. **计时帧只在 DEV**：生产构建里不产生、也不发送计时数据。

**验收标准**

- [ ] 帧编解码往返测试（含未知帧类型被拒绝）
- [ ] 握手版本不匹配 → 明确错误文案（不静默降级）
- [ ] `abort` 传播测试：调用侧收到中止，后台侧上游被中止
- [ ] 端口断开后无残留监听（用假 port 的单测断言）
- [ ] E2E：真实 Chromium 里跑通一次**完整流式往返**，且不依赖真实 API Key（见第 6 节「build-time mock provider」）

### 4.5 阶段 4 —— 内容脚本与面板

**目标**：用户真正会看到的那一层。也是风险最高的一层（跑在别人的页面里）。

**新增文件**

| 文件                                    | 内容                                                    |
| --------------------------------------- | ------------------------------------------------------- |
| `src/platform/extract/readability.ts`   | 基于 `@mozilla/readability` 的正文提取                  |
| `src/platform/extract/dom-heuristic.ts` | 启发式降级提取（Readability 拿不到正文时）              |
| `src/platform/extract/index.ts`         | 统一出口：两种方式产出同一结构                          |
| `src/platform/panel/host.ts`            | Shadow DOM 宿主：挂载、页面重建后的重挂、重复挂载守卫   |
| `src/platform/panel/snapshot.ts`        | 面板快照的读写（经后台 RPC，因为 tabId 只有后台能看到） |
| `src/domain/summary/budget.ts`          | 用 `computeTokenBudget` + 裁剪策略算出实际发送的正文    |
| `src/features/panel/**`                 | 面板 React 组件、Zustand store、拖拽 / 缩放、字号       |
| `src/features/markdown/**`              | Markdown 安全渲染管线                                   |
| `src/entrypoints/content/**`            | 薄壳：注入、右键菜单入口                                |

**关键设计决定**

1. **仍然不申请静态站点权限。** 采用「右键菜单 / 扩展图标 + `activeTab` + `scripting.executeScript` 按需注入」，而不是 manifest 里声明 `<all_urls>`。阶段 4 结束时复核一次最终权限面，任何新增权限都要有非它不可的理由。
2. **Markdown 渲染是安全边界。** `dangerouslySetInnerHTML` 的每一个 renderer 分支都必须产出转义后的内容：`html` token 转义、`link` 走白名单 + 转义、**`image` 不渲染 `<img>`**（模型输出受页面内容影响，渲染图片等于让页面驱动一次真实外发请求，且相对路径会命中被访站点）。Citation 占位符只在文本上下文替换，跳过标签内部。这套规则必须有回归测试（含 `![<img …>](javascript:…)` 这类构造）。
3. **面板宿主是可被页面干扰的普通 DOM 节点**，这是已知限制：页面清空 / 重建 `body` 会带走面板，用 MutationObserver 重挂；页面**预先**创建同名宿主元素可以让面板永不挂载（重复挂载守卫的副作用），无解，写进已知限制。
4. **快照只存 assistant 消息**，不存带整页正文的 prompt / system 消息；每标签页最多 20 个页面、合计 512K 字符，超出按 LRU 从最旧页驱逐；标签页关闭时由后台删除。
5. **裁剪策略是可见的用户设置**（`front / middle / back / nothing`）。`nothing` 不是错误路径，是「我就是想原样发出去，让服务商拒绝」的显式选择——长文被拒时自动按更小预算重试一次，但要在界面里说清楚发生了什么。
6. **主题与字号 token 单一来源**：面板 `:host` 与 popup / 设置页 `:root` 共用一套变量，颜色只有一个主色；正在编辑的字号档位由 `PANEL_FONT_SIZE_REM_PX` 统一换算。

**验收标准**

- [ ] 提取管线测试用固定 HTML fixture（文章页 / 列表页 / 正文极短 / 无正文）断言输出结构，不依赖网络
- [ ] 预算与裁剪测试：四种策略 × 「放得下 / 放不下 / 连 prompt 都放不下」的边界
- [ ] Markdown 安全回归测试（html / link / image / citation 四条分支各有用例）
- [ ] 快照测试：20 页以上触发驱逐、超配额时清空本页其它页后重试一次、单页 JSON 超限的降级行为
- [ ] E2E：本地 `file://` 或 `data:` 的固定文章页 → 触发总结 → 面板出现 → 刷新页面后面板恢复对话
- [ ] 面板字号 / 主题切换后刷新仍生效（与阶段 0 的设置链路复用）

### 4.6 阶段 5 —— 设置页与 popup 完整化

**目标**：让用户能自己把配置改对，而不需要读文档。

- 模型配置：新增 / 编辑 / 删除 / 排序 / 设为默认 / **测试连接**（一次轻量请求，展示状态码与延迟）
- Prompt 模板：新增 / 编辑 / 删除 / 设默认，变量提示与预览
- 通用设置：主题、面板字号、超长策略、日志级别
- 导入 / 导出：默认剔除凭据；导入前展示「将新增 N 条 / 跳过 M 条 unrecognized」
- popup：模型选择 + 总结 + 复制页面内容（**不含** Prompt 选择器——Prompt 只在设置页改，减少误改默认项的机会）

**验收标准**

- [ ] 表单校验在提交前拦下非法输入（headers 非字符串、base URL 非法、id 冲突）
- [ ] 删除 / 覆盖类操作有二次确认，且确认文案说明后果（是否连同默认项一起回退）
- [ ] 键盘可达：所有控件可 Tab 到达、有可见 focus、`eslint-plugin-jsx-a11y` 无 error
- [ ] 导入导出往返测试：导出 → 导入 → 列表与迁移版本一致（凭据按选择保留或剔除）

### 4.7 阶段 6 —— 硬化与分发

**目标**：把「能用」变成「可发布、可维护」。

- **i18n（OQ-3 已定：落 `zh_CN` + `en`）**：UI 字符串从阶段 1 起就走取词函数；本阶段把取词函数换成 `browser.i18n.getMessage` 并落 `_locales`，**同一批**把 manifest 的 `name` / `description` 换成 `__MSG_*__` 占位符（`_locales` 只做一半会让扩展名显示成占位符字面量）
- **无障碍**：键盘走查 + 对比度检查 + `jsx-a11y` 全绿
- **体积闸门**：新增 `scripts/check-bundle-budget.mjs`，在 CI 里断言 `background.js` 与整包体积不超过第 9 节预算，超了就失败（旧项目的 2.6 MB 就是这样悄悄长出来的）
- **权限审计**：逐条核对 `manifest.json` 的 `permissions` / `host_permissions` / `optional_host_permissions`，每条都要能回答「去掉它功能会怎样」
- **发版流程**：见下方固定步骤，写进 `AGENTS.md`
- **分发渠道（OQ-1 已定：v1 只发 GitHub Release 附件）**：商店上架不在本阶段承诺，但**隐私政策 + 逐权限说明**作为本阶段交付物先写好，上架时直接复用。注意 `optional_host_permissions` **不是**审核豁免——最小权限原则同时管 required 与 optional，商店表单要逐项说明权限用途

**发版固定步骤（摘自旧项目经验，yipie 沿用并加了两条校验）**

1. 改版本号，**两处同步**：`package.json` 的 `version`、`package-lock.json` 的顶层 `version` 与 `packages[""].version`（后者容易被 `npm install` 改回去）
2. `CHANGELOG.md` 增加对应版本条目
3. 跑完整闸门：`npm run gate` && `npm run build`
4. 清掉 `.output/*-chrome.zip`，避免旧包被误拷进新版本目录
5. `npm run zip`
6. **校验产物**：解开 zip 确认 `manifest.json` 的 `version` 与目标版本一致；**再确认 `.output/chrome-mv3/manifest.json` 也是目标版本**（旧项目曾落后两个版本无人发现）
7. 提交、打 tag `v<version>`、推送、用 `gh release create` 发 Release，说明取自 `CHANGELOG.md`

**验收标准**

- [ ] 体积闸门脚本在本地与 CI 都能失败也能通过（用一次故意的超预算改动验证它真的会拦）
- [ ] 从零克隆 → `npm ci` → `npm run build` → 在干净的 Chrome 里加载 → 完成一次真实总结（发布前的手工冒烟清单）
- [ ] 发布产物里不含源码映射、不含 `.env*`、不含测试残留

## 5. 通用完成定义（DoD）

每个阶段、每个提交都成立的底线：

- [ ] `npm run gate`（compile + test + lint）与 `npm run build` 全绿；**新增行为必须有测试**，而不是「以后补」
- [ ] 涉及后台 / 页面往返的改动，`e2e/` 有覆盖，或在本文件里写清为什么没有
- [ ] 契约有变化 → `contract/**` 改过，且 `contract/rpc.ts` 登记过新方法
- [ ] 持久化结构有变化 → 版本号 + 迁移路径同时到位，且迁移有幂等测试
- [ ] 用户可见行为有变化 → `README.md` 的「当前状态」与 `CHANGELOG.md` 的 `[Unreleased]` 同步
- [ ] 架构约束有变化 → `AGENTS.md` 的硬约束表同步（否则下一个人会照着旧规则写）
- [ ] 不留 `eslint-disable`、不留 TODO 注释替代实现、不用 `any` 逃逸类型
- [ ] 提交信息说明「为什么」，而不只是「改了什么」

## 6. 测试策略

| 层       | 工具                                                 | 覆盖什么                                              | 门槛                                   |
| -------- | ---------------------------------------------------- | ----------------------------------------------------- | -------------------------------------- |
| 契约单测 | Vitest（node 环境）                                  | schema 往返、默认值、patch 语义、迁移幂等、脏数据兼容 | 每个 contract 文件必配                 |
| 领域单测 | Vitest（node 环境）                                  | 纯函数：估算、预算、裁剪、URL 归一化、错误分类        | 关键分支全覆盖，边界值优先             |
| 平台单测 | Vitest + `tests/helpers/memory-store.ts`             | 服务层（读改写、队列、三态、快照驱逐）                | 不加载任何浏览器 API，保证可在 node 跑 |
| 组件测试 | Vitest + jsdom（逐文件 `@vitest-environment jsdom`） | Markdown 安全管线、面板交互的基本渲染                 | 每个安全分支一个用例                   |
| E2E      | Playwright + 真实 Chromium + 构建产物                | 扩展加载、RPC 往返、流式总结、面板挂载与快照恢复      | 不依赖真实 API Key（见下）             |
| 手工     | 你 + 真实 Key                                        | 真实服务商的连通性、流式体验、错误提示是否人话        | 每阶段一次，结论写进 CHANGELOG         |

**E2E 如何不依赖真实 API Key**：构建时注入一个 mock provider（例如 `WXT_E2E=1` 时注册一个本地回显 / 固定文本的 provider，仅在测试构建中可用）。E2E 断言的是**通道**（帧、握手、取消、面板状态、快照），不是模型质量。生产构建里这个 provider 必须不存在——这条同样要有断言。

**不做的事**：不为「覆盖率数字」写测试；不用测试去验证第三方库（zod 自身的解析行为不需要我们重复断言）；不用 E2E 覆盖本该用单测覆盖的纯逻辑。

## 7. 数据契约、迁移与兼容

**信封**：每个 key 独立存 `{ version, data }`。版本跟着 payload 走，而不是一个全局计数器——这样一个 key 的迁移不会被另一个 key 卡住，也不会出现「全局版本对了但某个 key 还是旧形状」。

**读取三态**：`ok` / `missing` / `invalid`。把 `invalid` 当成 `missing` 处理正是数据丢失的起点；`invalid` 必须被记录（含 zod issues）并让用户可见地降级，而不是悄悄用默认值继续。

| 情形                       | 处理                                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| 单条记录坏（列表里的一行） | 隔离到 `unrecognized`，不参与业务，写回时原样保留                      |
| 整个值坏（无法解析成信封） | 本次降级为默认值 + 日志（含 issues），**不写回覆盖**，直到用户主动保存 |
| 存储里的版本比当前代码更新 | 不覆盖、不猜测，提示用户（可能是降级安装）                             |
| 未知 / 已废弃的 key        | 不自动删除；清理必须是显式迁移步骤，并记在 CHANGELOG                   |
| 导入时全部无法识别         | 整体拒绝并报错，不做「部分成功」                                       |

**原则**：任何路径都不允许「静默删除用户数据」。删除只有一种来源——用户的显式操作。

## 8. 安全与隐私清单

每个阶段结束时过一遍，与本阶段相关的项必须仍然成立：

- [ ] **RPC 全校验**：发送方信任校验（`sender.id === browser.runtime.id`）+ 入参 zod 解析，由 `platform/rpc/server.ts` 统一施加
- [ ] **不加 `externally_connectable`**：manifest 一旦加上这个字段，信任校验就从「纵深防御」变成「唯一屏障」，需要重新评估
- [ ] **Markdown 注入面**：任何 renderer 分支返回未转义内容都是注入点；图片一律不渲染
- [ ] **不外发图片 / 不自动请求第三方资源**：页面内容不得触发新请求（含相对路径命中被访站点）
- [ ] **凭据**：只存 `storage.local`；不进日志（脱敏）、不进快照、导出默认剔除
- [ ] **权限最小化**：静态权限为零站点访问；新权限必须能回答「去掉它会怎样」
- [ ] **无遥测、无第三方统计**：任何「顺手加个上报」的提议都按产品决定处理，默认拒绝
- [ ] **依赖审计**：`npm audit` 的已知告警逐条记录处置理由（有修复的升级，无修复的记录影响面），不为了清零而盲目降级或替换依赖
- [ ] **内容脚本只做它需要做的事**：不读取无关 DOM，不采集页面元数据

## 9. 性能与体积预算

| 指标                         | 预算                       | 当前（阶段 0）             | 由什么看守            |
| ---------------------------- | -------------------------- | -------------------------- | --------------------- |
| `background.js`              | < 150 kB                   | 77.90 kB                   | 阶段 6 的 CI 脚本     |
| 整包 `.output/chrome-mv3`    | < 600 kB                   | 377.60 kB（大头是 React）  | 阶段 6 的 CI 脚本     |
| SW 冷启动引入的静态资源      | 不得出现 > 100 kB 的新资源 | ✅（无词表）               | review + 体积报告     |
| 单测总时长                   | < 5 s                      | 1.18 s（4 文件 / 20 用例） | 变更时的自觉，CI 时长 |
| E2E 单场景                   | < 60 s                     | ✅                         | Playwright timeout    |
| 面板到「可见外壳」的注入耗时 | < 50 ms（本地基准）        | 待阶段 4 测量              | 阶段 4 的基准记录     |

体积超预算时的处理顺序：先看是不是引入了大的静态数据（词表、图标集、全量语言包），其次看是不是把该懒加载的东西打进了入口，**最后**才考虑换实现。

## 10. 风险登记表

| #   | 风险                                                      | 影响                                 | 缓解                                                               | 状态     |
| --- | --------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------ | -------- |
| 1   | TypeScript 7 与类型感知 lint 目前二选一                   | 想升 TS 7 就得放弃最有价值的一类规则 | 停在 TS 6.x；上游放宽 `typescript-eslint` peer 范围后重评          | 已接受   |
| 2   | ESLint 10 暂不可用（`jsx-a11y` 未声明支持）               | 停在 9.x，会收到 maintenance 警告    | 记录在 `AGENTS.md`；等上游                                         | 已接受   |
| 3   | AI SDK 6 与 provider 规范版本不匹配（spec v1 运行时抛错） | 某些 provider 包直接不可用           | 只用 spec v2/v3 的 provider；`ollama` 走 OpenAI 兼容；写单测断言   | 已缓解   |
| 4   | 面板宿主可被页面干扰（清空 body、预先占位同名元素）       | 面板不显示，或消失后重挂             | MutationObserver 重挂 + 重复挂载守卫；剩余情形记为已知限制         | 部分无解 |
| 5   | 快照配额（20 页 / 512K 字符）触发写失败                   | 用户丢历史对话                       | 写分片失败时清掉本标签页其它页后重试一次；失败要可见，不静默吞     | 待实现   |
| 6   | E2E 依赖真实浏览器环境，沙箱恢复后依赖树会被清空          | 本地/CI 之外无法随时跑 E2E           | 附录 C 给出重建步骤；CI 里由 `playwright install --with-deps` 负责 | 已记录   |
| 7   | 依赖恢复后 `node_modules` 缺失                            | 闸门暂时跑不起来                     | `npm ci` 即可恢复（不升级任何依赖，保持 lockfile）                 | 已记录   |
| 8   | 上架审核（若选择商店）对权限与「总结任意网页」的质疑      | 审核延迟或要求增加权限说明           | 保持零静态站点权限；若上架，先写清隐私政策与权限理由（OQ-1）       | 未定     |
| 9   | 无凭据环境无法推送 / 发布                                 | 交付卡在「代码在本地」               | 一次性分支搬运（阶段 0 已用过一次）；或把会话切换到目标仓库        | 已缓解   |
| 10  | 从旧项目搬功能时顺手搬回旧架构                            | 硬约束被侵蚀，重蹈覆辙               | 阶段 1 的 ESLint 封口规则 + review 时对照第 2 节表格               | 待观察   |

## 11. 开放问题（需要你决定，附我的建议）

| #     | 问题                                          | 我的建议                                                                   | 决定（2026-10-13）                                                                            |
| ----- | --------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| OQ-1  | 分发渠道：GitHub Release 附件，还是商店上架？ | 先走 Release 附件（与旧项目一致，零审核成本）；商店上架作为阶段 6 的可选项 | **A：只发 GitHub Release 附件**；隐私政策 + 逐权限说明当阶段 6 交付物先写好，上架决策留到以后 |
| OQ-2  | 是否需要 Firefox？                            | 先只保 Chrome / Edge；WXT 侧保留 firefox 目标但不承诺，等主线跑顺再评估    | **A（比原建议更严）：v1 明确不做 Firefox**，连构建目标都不留；不兼容点与可行性清单见 11.1     |
| OQ-3  | 多语言范围？                                  | UI 从阶段 1 起就走取词函数，阶段 6 只落 `zh_CN` + `en` 最小集              | **B：采纳原建议**——阶段 6 落 `zh_CN` + `en`，且 `_locales` 与 manifest 字段本地化同批完成     |
| OQ-4  | Prompt 变量渲染语法？                         | Mustache 的最小子集（只做 `{{var}}` 替换，不做逻辑），避免模板变成脚本     | **采纳建议**，且**不引入 `mustache` 依赖**：手写纯函数放 `domain/`                            |
| OQ-5  | popup 是否保留 Prompt 选择器？                | 不保留（下拉会写全局默认项，误改代价大）；Prompt 只在设置页改              | **采纳建议**；popup 只读显示当前 Prompt 名 + 「去设置改」入口                                 |
| OQ-6  | 是否需要侧边栏 / 多开面板？                   | 不做。单浮动面板 + popup 已经覆盖使用方式                                  | **采纳建议**；`sidePanel` 还会多一项权限，且与阶段 4 的「单标签页单流」冲突                   |
| OQ-7  | 是否恢复 Ollama 原生 provider？               | 不恢复，走 OpenAI 兼容（阶段 2 的实测结论）                                | **C：阶段 2 只做 `openai-compatible`**，原生 Anthropic / Google 进 1.2 非目标                 |
| OQ-8  | 是否提供「从 KuaiKan 一键迁移配置」？         | 提供「导入旧项目导出的 JSON」而不是读取旧存储 key——边界清楚、可测试        | **C：不做迁移器**（旧项目也只有模型有导出格式，没有 Prompt），配置由用户手工重配              |
| OQ-9  | 是否引入精确 token 计数？                     | 不引入。若以后确实需要，走 offscreen document，绝不放进 SW                 | **采纳建议**；判定标准见 11.1                                                                 |
| OQ-10 | 新页面是否自动打开面板？                      | 默认关闭，由点击触发；设置里给一个开关                                     | **采纳建议**                                                                                  |
| OQ-11 | 错误上报？                                    | 无遥测。错误只在面板与设置页可见                                           | **采纳建议**；它同时决定 OQ-1 的隐私文案与 AMO 的 `gecko.data_collection_permissions: none`   |

### 11.1 决定依据与已知限制（2026-10-13 核对）

- **OQ-1**：`optional_host_permissions` **不是**审核豁免——最小权限原则同时适用于 required 与 optional，商店表单要逐项说明权限用途。Chrome 注册为一次性费用（官方注册页未标金额；可核实的官方数字是 2020 年博客的 US$5）；Edge 上架免费，但**没有公开的审核时限承诺**（2025-02 起的优先审核队列不是 SLA）。
- **OQ-2**：Firefox MV3 **不支持 `background.service_worker`**（用非持久化 event page），而 WXT 在 MV3 下为 `background` entrypoint 生成的是 service worker，且 WXT 对 Firefox 的默认 manifest 版本是 MV2 —— 所以「保留目标但不承诺」等于留一条没人测的构建路径。真要做时的可行性清单：event page 回退 + Firefox 实测、AMO 签名必须有 `browser_specific_settings.gecko.id`（MV3 不会自动分配）、2025-11-03 起新提交必须声明 `gecko.data_collection_permissions`（本项目填 `none`）、提供可复现的源码 ZIP。
- **OQ-3**：旧项目 `lib/i18n.ts`（272 行）的注释写着 “This extension is now Chinese-only (self-use fork)”，但取词函数的签名一直留着 —— 「留着取词函数、`_locales` 不做」是可持续的中间态；本仓既然承诺 en，就必须连 manifest 字段一起本地化。
- **OQ-7**：`ollama-ai-provider` 停在 spec v1（官方 `AI_UnsupportedModelVersionError` 案例是 AI SDK 5 的）；替代包 `ollama-ai-provider-v2` 当前 `latest` 面向 AI SDK 7 / Provider V4，不支持 5 / 6。`@ai-sdk/openai-compatible` 目前是 2.x（v2 spec），在 AI SDK 6 下走 compatibility mode —— 因此锁精确版本、不用 `latest`。
- **OQ-9 判定标准**：只有「必须本地显示用量」与「服务商不返回 `usage`」同时成立时才考虑；届时走 offscreen document，绝不放进 SW。
- **CORS（同期改了 `AGENTS.md` 第 5 条）**：旧项目 `entrypoints/background/cors-fix.ts` 用 `declarativeNetRequest` 往响应注入 `Access-Control-Allow-Origin`，它是**给自己造出来的问题打补丁**：静态声明 `<all_urls>` 后，用户一旦把站点访问改成「在特定网站上」，Chrome 就撤销运行时 host 权限，SW 的 `fetch()` 才开始被 CORS 拦。只要扩展对该 origin 持有 host 权限，Chrome 就豁免扩展请求的 CORS 检查 —— yipie 的按-origin 授权模型天然不需要这个 hack。

## 12. 工作方式

**推进方式**：每次按「契约 → 平台 → 壳 → 测试 → 文档」的顺序做**一个纵切片**，每个切片能独立跑通并通过闸门、独立提交。不做「先铺完所有文件再接线」的大提交。

**我每阶段交付什么**

1. 改动摘要（哪些文件、为什么）
2. **实跑证据**：命令与输出（`gate` / `build` / `e2e` 的执行结果），失败或跳过的项明确写出来
3. 已知限制与未做的事
4. 下一阶段的入口与需要你决定的问题

**我需要你提供的**

- **手工连通性验证**：真实 API Key 的调用由你执行并反馈结果；我不会读取、保存或写入你的密钥
- **仓库与推送授权**：代码推到哪个仓库（本会话当前连接的仓库见对话上下文）
- **OQ 的决定**：第 11 节里的问题会影响阶段 1–6 的实现细节

**我不会做的**：不运行 `npm run dev`（常驻进程，需要时通知你手动跑）；不为了让闸门变绿而放宽规则、跳过测试或加类型抑制。

## 附录 A —— 目标目录结构（阶段 6 时预期）

```
src/
  contract/          唯一事实来源：schema + 类型 + 信封版本 + 协议定义
    general-settings.ts · model-config.ts · prompt-config.ts · selection.ts
    mutations.ts · migration.ts · rpc.ts · stream-protocol.ts · index.ts
  domain/            纯函数，零环境依赖，必须能在 node 里 100% 单测
    token-estimate.ts · model/{base-url,errors}.ts · summary/{budget,truncate}.ts
  platform/          唯一允许调用浏览器 API 的层
    storage/{types,repo,tx,wxt-store}.ts
    rpc/{messaging,server,client,trust}.ts
    settings/{general-settings,model-configs,prompt-configs,selection,migration}-service.ts
    model/{provider,policy,usage}.ts
    stream/{bridge,transport}.ts
    extract/{readability,dom-heuristic,index}.ts
    panel/{host,snapshot}.ts
    logger/index.ts
  features/          与界面绑定的逻辑（React 组件、store、渲染管线）
    panel/** · markdown/** · settings/**
  entrypoints/       薄壳，只做装配
    background/index.ts · content/** · options/** · popup/**
tests/               Vitest（node 为主，组件测试逐文件 opt-in jsdom）
e2e/                 Playwright（真实 Chromium + 构建产物）
docs/                development-plan.md（本文）
```

分层方向由 ESLint 强制：`contract → domain → platform → entrypoints`。`features/` 只允许被 `entrypoints/` 引用，且只能向下依赖 `platform` / `domain` / `contract`。

## 附录 B —— 命名与提交规范

- **文件 / 目录**：kebab-case；一个文件一个明确职责；契约文件与存储 key 一一对应
- **导出**：类型与运行时值同名导出（`export const X = z.object(...)` + `export type X = z.infer<typeof X>`）
- **提交信息**：`type(scope): 说明`，type ∈ `feat / fix / refactor / test / docs / chore / perf`；正文说「为什么」，中文可
- **分支**：`main` 为主；开发用 `feat/<主题>`；发布打 tag `v<version>`
- **storage key**：一律 `local:` 前缀，常量定义在 `contract/**`，业务代码不写裸字面量
- **测试文件**：`tests/<层>/<被测文件>.test.ts`，与源码路径同构，便于「改了实现就该改哪个测试」一眼可见

## 附录 C —— 阶段 0 的证据与复现

**当日（2026-10-13）在本沙箱复跑的结果**

| 检查                          | 命令                                  | 结果                                                      |
| ----------------------------- | ------------------------------------- | --------------------------------------------------------- |
| 类型检查 + 单测 + lint + 格式 | `npm run gate`                        | 通过（`Test Files 4 passed` / `Tests 20 passed`）         |
| 构建                          | `npm run build`                       | 通过，`Σ Total size: 377.60 kB`，`background.js 77.90 kB` |
| 产物权限面                    | 读 `.output/chrome-mv3/manifest.json` | `permissions: ["storage"]`，无 `host_permissions`         |
| E2E（真实 Chromium 加载扩展） | `npm run test:e2e`                    | **上一轮在本沙箱通过**；依赖树被清空后需按下方步骤重建    |

E2E 断言的是：扩展能加载 → MV3 service worker 起得来 → 选项页渲染 → 把「主题」改成 dark 经后台 RPC 落盘 → **刷新页面后仍是 dark**。最后一步是关键：它排除了「只活在 React state 里」的假通过。

**在本沙箱（无 root 容器）跑 E2E 的三件额外事项**

1. 容器内 `no new privileges` 使 Chromium 自带沙箱不可用 → 启动参数需要 `--no-sandbox`。当前 `e2e/smoke.spec.ts` **没有**这个参数（CI 不需要它）；本地临时加，或等阶段 6 把它改成读环境变量的开关，避免 CI 与本地分叉。
2. 缺 X11 / NSS 等约 16 个动态库：无 root 时把 deb 依赖解到可写前缀（例如 `/tmp/sysroot`），运行时用 `LD_LIBRARY_PATH` 指过去。
3. 必须装字体并自建 fontconfig 配置。否则 Skia 直接 FATAL（`SkFontMgr_FontConfigInterface.cpp:163 Not implemented`），浏览器一开就崩——这一条最容易误判成「库没装齐」。

CI 里这三条都不需要：`.github/workflows/quality.yml` 用 `npx playwright install --with-deps chromium` 装齐依赖。

**已知的环境无常**：沙箱恢复后 `/tmp` 与 Playwright 浏览器缓存会被清空（`node_modules` 也会）。恢复后重跑闸门的步骤是 `npm ci` → `npm run gate` → `npm run build`；要跑 E2E 再重做上面三条。

## 附录 D —— 本文档变更记录

| 日期       | 变更                                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-13 | 初版：阶段 0 小结与证据、阶段 1–6 计划、DoD / 测试策略 / 迁移 / 安全 / 预算 / 风险 / 开放问题                                                                                                         |
| 2026-10-13 | OQ-1～11 定案（只发 Release 附件 / 不做 Firefox / 多语言落 `zh_CN`+`en` / 仅 `openai-compatible` / 不做 KuaiKan 迁移器）；按新证据修正阶段 2 的 spec 版本论证与审核结论；新增 11.1 决定依据与已知限制 |
