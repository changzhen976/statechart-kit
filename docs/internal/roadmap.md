# 抽取路线图

把 `scxml-creator` 与 `node-red-contrib-scxmljs` 共用的状态机逻辑下沉到本包。

**不在范围内**：渲染器本身（属于 `@tinyactors/scxmljs`）、全局变量注册表、MQTT 桥、
时钟服务、事件路由、Fastify REST、Node-RED 节点与总线。

| 阶段 | 内容 | 估时 | 状态 |
| --- | --- | --- | --- |
| P0 | 仓骨架、构建链（ESM + d.ts）、逐字快照、基线冻结、打包冒烟、CI | 0.5–1 人日 | ✅ 完成（v0.1.0） |
| P1 | 命名策略 `NamingPolicy` 注入；校验分层；core 文案 code 化；`events.ts` 拆分 | 3–4 人日 | ✅ 完成（v0.2.0） |
| P2 | `engine` 补齐 `scriptTimeoutMs` / `maxMicrosteps` / `data` 预置与 trusted/sandboxed 选择；合并懒加载器 | 1.5–2 人日 | ✅ 完成（v0.3.0） |
| P3 | Vue 编辑器抽离：`EditorHost`、`features`、`mountEditor`、样式随包 | 6–8 人日 | ✅ 完成（v0.4.0） |
| P4 | `scxml-creator` 切换到本包，删除本地副本 | 2–3 人日 | ✅ 完成（core/engine + 编辑器） |
| P4.1 | 变量/事件显式属性（全局/广播）替代前缀约定 | 2–3 人日 | ✅ 完成（kit 通用 attrs + 字段注册） |
| P4.2 | UI 收尾：固定状态位/标签页/事件面板 | 2–3 人日 | ✅ 完成（v0.7.x） |
| P4.3 | 导入能力补齐：`<donedata>`、无 target / `type="internal"` 转移（KIT-003/004） | 3–4 人日 | ✅ 完成（v0.9.0） |
| P4.4 | 编辑器完整性：转移 target/type、doneData 编辑器、可选 Explorer、画布匹配回归 | 4–6 人日 | ✅ 完成（v0.10.0） |
| P4.5 | 宿主运行时反哺：done.states、error 定位、本地化、诊断 code 目录 | 4–6 人日 | ✅ 完成（v0.11.0） |
| P5 | `node-red-contrib-scxmljs` 切换（**宿主仓库任务**：删除 vendor 与 17 条构建期替换） | 3–4 人日 | ✅ 已完成（宿主 0.2.0 起；当前宿主 0.7 使用 kit 0.10.0） |
| P6 | 发布与治理：版本策略、CHANGELOG、发布流水线 | 1.5–2 人日 | 待开始 |
| P7 | 宿主集成加固：done 终态、错误定位、编辑器本地化（KIT-006–010） | TBD | 待排期（0.11 候选） |

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
   - P1 曾在 `src/policies/server.ts` 提供 `SERVER_POLICY` 兼容预设；**P4 按边界迁回
     `scxml-creator/src/policy/server.ts`**，kit 不再发布服务端/MQTT 语义。
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
5. **架构梳理**：隐患清单与剩余风险见 [`docs/internal/architecture-review.md`](architecture-review.md)。

**验收**：新增 `verify-engine` 38 条断言；`npm test` 7 个套件全绿；
`validateDocument` 对含自定义 JS 的示例在 Node 下也能通过；`check:pack` 验证动态加载可解析。

## P3 的产出与边界（v0.4.0）

1. **新入口 `statechart-kit/vue`**
   - `mountEditor(el, options)` / `createEditor(options)` / `EditorHost`；
   - `EditorAdapter`：持久化、文件导入导出、外部事件、部署/退出由宿主注入；
   - `features` 能力开关；`labels` 文案覆盖；`vue` 为 optional peer。
2. **编辑器实现**（`src/vue/`）
   - 不依赖 Pinia：`reactive` store + provide/inject；
   - Toolbar / StructurePanel / ChartCanvas / PropertyPanel / VariablesPanel / SimPanel /
     SimBar / ConfirmDialog / ValidationDialog；
   - 复用 core/engine：文档模型、序列化、命名策略、`validateDocument`、`SessionRunner`；
   - 样式集中为 `src/vue/styles.css` → `dist/vue/style.css`（显式 import）。
3. **构建链**
   - `tsup` 继续负责 core/engine/policies；
   - `vite build` 编译 SFC → `dist/vue.js`；`vue-tsc` 生成 `dist/vue-types/**`；
   - `check:vue` 在 happy-dom 中真实挂载构建产物；`check:pack` 断言 Vue 资源/类型。
4. **边界（留给 P4）**
   - 画布点击选中/缩放平移/Explorer、结构化动作编辑器、服务端绑定/草稿锁/冲突横幅；
   - 详见 [`docs/editor.md`](../editor.md) §6。

**验收**：`verify-editor` 含模块契约断言；`npm test` 8 个套件；`npm run typecheck`（tsc + vue-tsc）；
`check:vue` 挂载/卸载 + 模块标签/命令渲染通过；`check:pack` 覆盖四个入口。

## P4 迁移进度（已完成）

- ✅ `scxml-creator` 删除本地 `src/core`、`src/engine`，改为 `statechart-kit` /
  `statechart-kit/engine`；宿主保留 `src/{events,storage,audit}.ts` 与
  `src/compat/{naming,validator}.ts`。
- ✅ 兼容层处理旧签名/`message` 字段；donor 的 `test:all` 与 9 个浏览器检查全绿。
- ✅ kit 新增 `diagnostics/zh` 供宿主复用诊断格式化；修复 core 漏导出 `EXAMPLES`。
- ✅ **Scope cleanup**：`SERVER_POLICY`/MQTT 命名迁回宿主；kit 只保留 `BASE_POLICY`；
  编辑器默认策略改 `BASE_POLICY`；kit 诊断不再内置 MQTT 专属文案。
- ✅ **EditorModule 契约**：标签页/工具栏/事件来源/额外校验/清理生命周期；上层功能以模块
  注入核心编辑器（见 [`docs/editor-modules.md`](../editor-modules.md)）。
- ✅ 编辑器 UI 已切到 `statechart-kit/vue`；新增画布点击/缩放、结构化动作、校验定位；
  creator `src/editor-modules/service.ts` 接 service store，本地 `components/panels/viewhost/stores/project.ts` 已删除。
- ⏳ `scxml-creator` 的 `statechart-kit` 依赖当前是 `file:../statechart-kit`；发布后改固定版本。
- ⏳ Explorer 调试视图、侧栏拖拽/折叠等增强未在 kit 编辑器中复刻，可按需作为模块/后续补回。

## 0.11 候选（宿主反哺，2026-11-12）

来自 Node-RED 宿主 0.7 的集成反馈；详细现象、证据、期望与验收见
[`kit-requirements.md`](kit-requirements.md) 的 KIT-006–011。

- **P1 KIT-006**：`done` 事件携带终态配置，抑制 done 后的空 `active`；
- **P1 KIT-007**：`error` 事件携带出错状态/转移/动作位置；
- **P2 KIT-008**：诊断格式化可本地化，或允许宿主注入 formatter；
- **P2 KIT-009**：英文 `EditorLabels` 预设 / `locale`；
- **P2 KIT-010**：导出诊断 code 目录；
- **P3 KIT-011**：`send()` 失败原因（可选，宿主可先检查 boolean）。

KIT-002 / KIT-005 仍属于上游 `@tinyactors/scxmljs`，不在本候选范围内。

## 消费方同步

| 仓库 | 现状 | 切换点 |
| --- | --- | --- |
| `scxml-creator` | 已切 core/engine；编辑器 UI 仍为增强版 | P4 收尾 |
| `node-red-contrib-scxmljs` | 已切换 core/engine/editor；当前使用 kit 0.10.0，无 vendor 残留 | 已完成（宿主 0.2.0） |
