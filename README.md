<h1 align="center">一瞥 Yipie</h1>

<p align="center">
  用你自己的大模型 API Key 总结网页。<br/>
  纯本地运行 · 无后端服务 · 不采集任何遥测数据
</p>

## 这是什么

一瞥（Yipie）是一个网页总结浏览器扩展（Chrome / Edge / Firefox，Manifest V3）：在任意网页上
一键调用**你自己配置的模型**生成结构化总结。所有请求从你的浏览器直连模型服务商，不经过任何
第三方服务器。

## 当前状态

**0.1.0 是「可行走的骨架」（walking skeleton）**，不是可用的总结工具：

- ✅ 分层架构、契约层、存储层、RPC 控制面、工具链与 CI 闸门已就位
- ✅ 一根完整纵切片：通用设置经「存储 → 后台 RPC → 设置页」全链路打通并有测试
- ⬜ 模型配置、Prompt 模板、正文提取、流式总结、内容脚本面板尚未实现（见路线图）

## 设计约束（改代码前请先读）

1. **契约优先**：`src/contract` 是唯一事实来源。类型、运行时校验、存储版本都从 zod schema 推导，
   不手写清洗函数。
2. **分层单向依赖**：`contract → domain → platform → entrypoints`。反向依赖会被 ESLint 拦下
   （`import-x/no-restricted-paths`）。
3. **存储只有一条写队列**：业务代码不得直接调用存储适配器的 `setItem`；写操作一律经
   `platform/storage` 的仓库函数，由 `tx.ts` 串行化。
4. **每个 RPC 都校验**：发送方信任校验与入参 zod 校验由 `platform/rpc/server.ts` 统一施加，
   handler 不得绕过。
5. **权限最小化**：manifest 目前只有 `storage`。模型端点的 host 权限在用户添加模型时按 origin
   动态申请（`optional_host_permissions`），安装时不索取任何站点访问权。
6. **不计入精确分词**：正文预算用保守的近似估算（`domain/token-estimate.ts`），真实用量取服务商
   返回的 `usage`。不把 2MB 词表打进 service worker。

## 开发

```bash
npm install
npm run dev       # WXT 开发模式
npm run gate      # compile + test + lint
npm run build     # 产物在 .output/chrome-mv3
npm run test:e2e  # 需要先 build，会用真实 Chromium 加载扩展
```

## 路线图

完整计划（每个阶段的交付物、验收标准、测试策略、迁移与安全策略、风险与开放问题）见
[docs/development-plan.md](docs/development-plan.md)。下表只是摘要；两者冲突时以该文档为准。

| 阶段 | 内容                                                                                    |
| ---- | --------------------------------------------------------------------------------------- |
| 0    | 走骨架 ✅                                                                               |
| 1    | 契约与平台层补全（模型配置 / Prompt 的 schema、变更面 RPC、迁移、导入导出）             |
| 2    | Provider 与权限（`createLanguageModelFromConfig`、按 origin 申请权限、错误映射、usage） |
| 3    | 流式通道（runtime port 桥、带版本握手的帧协议、abort 与清理）                           |
| 4    | 内容脚本与面板（正文提取管线、近似预算、面板 UI、快照恢复、右键菜单）                   |
| 5    | 设置页与 popup 完整化（模型 / Prompt CRUD、导入导出、通用设置、日志级别）               |
| 6    | 硬化与分发（无障碍与 i18n、体积与权限审计、发版流程、Release / 上架）                   |

## License

MIT
