# 抽取路线图

把 `scxml-creator` 与 `node-red-contrib-scxmljs` 共用的状态机逻辑下沉到本包。

**不在范围内**：渲染器本身（属于 `@tinyactors/scxmljs`）、全局变量注册表、MQTT 桥、
时钟服务、事件路由、Fastify REST、Node-RED 节点与总线。

| 阶段 | 内容 | 估时 | 状态 |
| --- | --- | --- | --- |
| P0 | 仓骨架、构建链（ESM + d.ts）、逐字快照、基线冻结、打包冒烟、CI | 0.5–1 人日 | ✅ 完成（v0.1.0） |
| P1 | 命名策略 `NamingPolicy` 注入；校验分层；core 文案 code 化；`events.ts` 拆分 | 3–4 人日 | ✅ 完成（v0.2.0） |
| P2 | `engine` 补齐 `scriptTimeoutMs` / `maxMicrosteps` / `data` 预置与 trusted/sandboxed 选择；合并懒加载器 | 1.5–2 人日 | ✅ 完成（v0.3.0） |
| P3 | Vue 编辑器抽离：`EditorHost`、`features`、`mountEditor`、样式随包 | 6–8 人日 | 待开始 |
| P4 | `scxml-creator` 切换到本包，删除本地副本 | 2–3 人日 | 待开始 |
| P5 | `node-red-contrib-scxmljs` 切换到本包，删除 vendor 与 17 条构建期替换 | 3–4 人日 | 待开始 |
| P6 | 发布与治理：版本策略、CHANGELOG、发布流水线 | 1.5–2 人日 | 待开始 |

关键路径：P0 → P1 → P2 → P3 → P5（最短约 14 人日）。P4 与 P5 在 P3 之后可并行。

## P0 的产出与边界

- **逐字快照，零行为改动**：`src/core` 7 文件 + `src/engine` 1 文件 + `test` 3 脚本。
- **一致性可验证**：`docs/baseline.json` 记录 sha256 与 donor commit；`check:baseline` 检测手改与 donor 前进。
- **发布物可验证**：`check:pack` 真的打包、解包、按 exports map 导入并跑一次序列化。
- **刻意未搬**：见 `docs/baseline.json` 的 `excluded`。其中 `validator.ts` 是 P1 的首要目标
  ——它目前静态依赖引擎，是「纯核心不纯」的根源。

## P1 的产出与边界（v0.2.0）

1. **命名策略注入**
   - `src/core/naming-policy.ts`：`NamingPolicy` / `NamingNamespace` / `BASE_POLICY`；core 只做
     最长前缀匹配与 allow/block/warn 判定，不出现任何服务端前缀字面量。
   - `src/policies/server.ts`：`SERVER_POLICY` 兼容预设，逐条复刻 donor 的
     `gv_`/`ge_`/`t_`/`mqe_`/`mqv_`/`sys.`/`g_` 语义与 v1→v2 迁移。
   - `src/core/migrate.ts`：只保留文档遍历骨架，具体改名函数由策略提供。
2. **校验分层**
   - `src/core/validate-structure.ts`：`validateStructure(doc)` 零依赖；覆盖非法/重复 id、
     悬空 parent、父子环、history/final/atomic 约束、initial 指向、转移端点与 delayMs。
   - `src/engine/validator.ts`：`validateScxml` / `validateAgainstEngine` / `validateDocument`
     （结构 → 命名 → parse/compile），并提供 `scriptHitsToIssues` 的统一实现。
3. **文案 code 化**
   - 命名、导入、校验诊断统一 `{ code, params }`；`NamingIssue`/`StructureIssue`/
     `ImportWarning`/`ValidationIssue` 均带定位字段（stateId/event/slot/actionIndex/line）。
   - `ACTION_KINDS.label` 改为消息 code；`activeSummary` 返回
     `{ labels, count, truncated }`；日志截断不再拼中文字符串。
4. **events.ts 拆分**
   - core：`event-catalog.ts`（事件事实 + 三方向目录 + 广播标记）、`active-tree.ts`
     （激活树/展平/结构化摘要）。
   - 宿主保留：时钟/路由/MQTT 来源抓取、来源 tag/tip、分组标题等展示文案。

**验收**：P0 三个套件行为断言不变（`verify-import` 仅改为接收 `ImportWarning[]`）；
新增 `verify-naming` / `verify-events` / `verify-validation` 共 101 条断言；
`check:baseline` 只对 `mirrored` 文件继续要求与 donor 同字节；`check:pack` 覆盖三个入口。

## P2 的产出与边界（v0.3.0）

1. **统一懒加载器** `src/engine/engine-loader.ts`
   - `loadEngine(mode)` / `preloadEngine(mode)` / `createEngineSession(source, opts)`；
   - 按 `sandboxed` / `trusted` 缓存，失败可重试；validator 复用同一 trusted 模块；
   - engine 入口不静态 import 任一实现，QuickJS/WASM 只在首次 sandboxed 会话加载。
2. **选项与 data 预置**
   - `scriptTimeoutMs` / `maxMicrosteps` / `memoryLimitBytes` 透传并在 loader 校验；
   - `data` 在 `createSession` 前注入 `<data>`；`SessionRunner` 构造器与 `start()` 支持浅合并。
3. **生命周期加固**
   - `generation` 令牌解决并发 start / stop-during-start 的会话泄漏；
   - 监听器逐个隔离 + `onListenerError`；初始 `active` 只派发一次；启动失败回 idle。
4. **core 侧配套**
   - `serializeChecked`（`DocumentStructureError`）替代“容忍序列化 + 事后才发现错误”；
   - `scxmlToDoc` 无 DOMParser 时返回 `import.no-dom-parser`；
   - CDATA 中和抽成 `cdata.ts`，导入/校验/建会话共用，Node 下含 script 的文档不再误判。
5. **架构梳理**：隐患清单与剩余风险见 [`docs/architecture-review-p2.md`](architecture-review-p2.md)。

**验收**：新增 `verify-engine` 38 条断言；`npm test` 7 个套件全绿；
`validateDocument` 对含自定义 JS 的示例在 Node 下也能通过；`check:pack` 验证动态加载可解析。

## 消费方同步

| 仓库 | 现状 | 切换点 |
| --- | --- | --- |
| `scxml-creator` | 自带 `src/core`、`src/engine` | P4 |
| `node-red-contrib-scxmljs` | `src/vendor/scxml-core`（手动 `sync-vendor`）+ 17 条压缩产物替换 | P5 |
