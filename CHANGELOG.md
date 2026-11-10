# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.7.0] - 2026-11-10

P4.1：宿主可扩展的变量/事件属性，替代全局前缀约定。

### Added

- `DataVar.attrs?: Record<string, string|number|boolean>`，kit 只持久化、不解释语义
- `ProjectDoc.eventAttrs?: Record<string, attrs>`，按事件名保存宿主属性
- `EditorModuleContext.variableFields/eventFields` 字段注册；变量页/事件区按字段渲染
- SCXML 导入导出用 `data-kit-attrs` / `data-kit-event-attrs` 保留属性
- editor store 新增 `setVariableAttr` / `setEventAttr`、字段 getter 与清理

### Compatibility

- `gv_`/`ge_` 前缀不再作为 kit 语义；creator 在宿主迁移层把它们降级为显式属性
- 新增 `test:attrs` 覆盖属性 roundtrip、字段注册、属性写入

## [0.6.0] - 2026-11-10

P4 收尾：kit 编辑器补齐状态机编辑核心，creator 完成整体接入。

### Added

- 画布交互：点击选中状态/转移、缩放/平移/适应窗口、方向切换、契约失效探针
- 结构化动作编辑器（send/cancel/assign/log/script；textarea 可降级）
- 校验弹窗「定位」：选中状态/转移并 flash 动作行；含 script 提示弹窗
- `EditorModule` 的创建者示例：creator `service` 模块（服务绑定/外部事件）

### Changed

- creator 删除本地 `components/panels/viewhost/stores/project.ts`；编辑器改用
  `statechart-kit/vue`，service store 通过 `src/editor` 单例读写同一份文档
- kit Vue 构建将 SFC scoped CSS 与全局样式合并为 `dist/vue/style.css`

## [0.5.0] - 2026-11-10

P4 边界收敛：kit 只保留核心建模/编辑能力与 `BASE_POLICY`；上层功能模块化。

### Added (P4 host migration)

- `EditorModule` 契约（`statechart-kit/vue`）：宿主可贡献右侧标签页、工具栏命令、
  外部事件来源、额外校验，并参与 `destroy` 清理；上层功能不再写进 kit
- `statechart-kit/diagnostics/zh` 入口：通用诊断 `{code,params}` 的默认中文格式化，
  Vue 编辑器与 `scxml-creator` 共用
- `EXAMPLES` / 示例构造函数重新从 core 入口导出（P1 重构遗漏；P4 切换时发现）

### Changed (BREAKING)

- 删除 `statechart-kit/policies/server` 入口与 `SERVER_POLICY`：服务端/MQTT 命名策略
  迁回宿主（`scxml-creator/src/policy/server.ts`）；kit 只保留 `BASE_POLICY`
- `statechart-kit/vue` 的默认 `policy` 改为 `BASE_POLICY`（宿主应显式传入组合策略）
- `diagnostics/zh` 不再内置 `naming.mqtt-var.*` 等宿主专属文案；宿主自行扩展
- P5（Node-RED）从 kit 路线图移除，改为宿主仓库任务；kit 不新增 Node-RED/MQTT 专属 API

### Planned (P4)

- `scxml-creator`：用 `EditorModule` 接全局变量/路由/MQTT/部署，切换编辑器 UI
- 发布后把 donor 的 `file:../statechart-kit` 改为固定版本

## [0.4.0] - 2026-11-10

P3：可嵌入 Vue 编辑器。新增 `statechart-kit/vue` 入口；core/engine 行为不变。

### Added

- `statechart-kit/vue`：`mountEditor` / `createEditor` / `EditorHost` / `EditorAdapter` /
  `EditorFeatures` / `createBrowserAdapter` / 诊断 code 中文格式化
- 编辑器组件：Toolbar、StructurePanel、ChartCanvas（官方 `<scxml-view>`）、PropertyPanel、
  VariablesPanel、SimPanel、SimBar、ConfirmDialog、ValidationDialog
- `EditorAdapter`：持久化、导入导出、外部事件、部署/退出、只读、脏状态/日志回调
- `features` 开关与 `labels` 文案覆盖；`vue` 作为 optional peerDependency
- `src/vue/styles.css` 随包发布为 `statechart-kit/vue/style.css`
- Vite 构建 SFC + `vue-tsc` 生成 `dist/vue-types/**`；`check:vue` happy-dom 挂载冒烟
- `test/verify-editor.ts`：25 条断言
- `docs/editor-p3.md`：入口、adapter 契约、构建、P4 迁移边界

### Changed

- `sideEffects` 改为 `["./dist/vue.js", "*.css"]`
- `npm run build` 拆为 `build:core`（tsup）+ `build:vue`（Vite + vue-tsc + 样式复制）
- `npm run typecheck` 追加 `vue-tsc`
- `verify:all` 追加 `check:vue`；CI 增加 Vue smoke 步骤

### Notes

- 编辑器不读 localStorage、不发 HTTP；默认浏览器适配器可被宿主整体替换。
- P3 的画布只做 source/session 同步；点击选中、缩放平移、Explorer 与结构化动作编辑器
  留在 P4（见 `docs/editor-p3.md` §6）。

## [0.3.0] - 2026-11-10

P2：引擎选项、统一懒加载器、会话生命周期加固与 core 配套。含破坏性 API 变更
（`0.x` minor 允许）。

### Added

- `engine-loader`：`loadEngine` / `preloadEngine` / `createEngineSession`，按
  `sandboxed`/`trusted` 懒加载并共享缓存；validator 复用同一 trusted 模块
- `SessionRunnerOptions`：`engine`、`scriptTimeoutMs`、`maxMicrosteps`、
  `memoryLimitBytes`、`data`、`onListenerError`
- `SessionRunner.start(source, { data })`：启动前覆盖 `<data>` 初始值
- `SessionRunner` 新 API：`status`、`settled()`、`engineMode`
- `serializeChecked(doc)` + `DocumentStructureError`（结构 error 时拒绝序列化）
- `neutralizeCdata`（core）：导入/校验/建会话共用，修复 happy-dom 的 script CDATA 兼容性
- `import.no-dom-parser`：Node 未注入 DOMParser 时给出结构化错误
- `docs/architecture-review-p2.md`：分层、15 项隐患与 6 项剩余风险
- `test/verify-engine.ts`：38 条断言

### Changed

- **BREAKING**：`assignVariable` / `assignValue` 返回值由 `{ ok, message }` 改为
  `{ ok, code, params }`（`variable.*`），文案由宿主本地化
- **BREAKING**：`send()` 返回 `boolean`；`pause()` / `play()` 返回 `boolean`；
  `step()` 返回执行任务数；`setSpeed()` 返回实际生效速度
- **BREAKING**：`statechart-kit/engine` 不再静态 import 引擎实现；依赖动态 import 的
  bundler/宿主需允许 `@tinyactors/scxmljs` 与 `@tinyactors/scxmljs/trusted` 的动态导入
- `SessionRunner` 初始 `active` 只派发一次（原先引擎 macrostep + 手动调用各一次）
- idle 时 `pause/play/step` 为 no-op；NaN/负数速度归零
- `readVariables()` 标记为 deprecated，统一用 `snapshot()`

### Fixed

- 并发 `start` / 加载中 `stop` 导致的旧会话与监听器泄漏
- 重写时遗漏 `addEventListener` 导致会话事件完全不派发
- 启动失败可能残留 clock/监听器；栈内监听器抛错会阻断其他监听器
- 含 `<script>` 的文档在 happy-dom 下校验/启动被误判为解析失败
- Node 无全局 `DOMParser` 时抛 `ReferenceError`

## [0.2.0] - 2026-11-10

P1：命名策略注入、校验分层、诊断 code 化、事件模块拆分。**包含破坏性 API 变更**
（`0.x` 期间 minor 允许），行为以 P0 三个验证套件为准，不改变 SCXML 序列化/运行语义。

### Added

- `NamingPolicy` / `NamingNamespace` / `BASE_POLICY`（core）与 `SERVER_POLICY`
  （新入口 `statechart-kit/policies/server`，保持 donor 的 `gv_`/`ge_`/`t_`/`mqe_`/`mqv_`/`sys.`/`g_` 语义）
- `src/core/migrate.ts`：策略驱动的 v1→v2 文档迁移骨架
- `src/core/event-catalog.ts`：文档事件事实（发出/监听/发出位置/监听边）、三方向目录、广播标记
- `src/core/active-tree.ts`：激活状态层级树、展平、结构化摘要
- `src/core/validate-structure.ts`：零依赖结构校验（id、父子、环、history/final/atomic、initial、转移、delayMs）
- `src/engine/validator.ts`：`validateScxml`、`validateAgainstEngine`、`validateDocument`、`scriptHitsToIssues`
- 测试：`verify-naming`（58）、`verify-events`（21）、`verify-validation`（22）

### Changed

- **BREAKING**：`checkEventName` / `checkVarName` / `checkDocNaming` 改为策略优先签名
  （`checkEventName(policy, name, ctx?)`），返回值由 `{ level, message }` 改为 `{ level, code, params }`
- **BREAKING**：`migrateDoc` / `migrateEventName` / `migrateVarName` / `migrateExpr` /
  `migrateActionLine` 改为策略优先签名；服务端迁移规则移入 `SERVER_POLICY`
- **BREAKING**：`scxmlToDoc` 的 `warnings` 由 `string[]` 改为 `ImportWarning[]`；
  解析错误改为 `ScxmlImportError { code, params }`
- **BREAKING**：`buildDirectionCatalog` 三方向字段改为语义名 `in`/`out`/`lone`，
  广播以 `row.broadcast` 表示；`buildDocEventOptions`/`buildObservedCatalog` 等宿主展示函数
  不在 core，随 P4 迁回宿主
- **BREAKING**：`activeSummary` 返回 `{ labels, count, truncated }`（不再拼展示文案）
- **BREAKING**：`ACTION_KINDS.label` 改为消息 code（`action.send` 等）
- `log.truncateText` 截断不再附带中文字符串
- 结构校验进入 core 后，`validator.ts` 的引擎部分移到 `statechart-kit/engine`

### Documentation

- README/路线图补充 P1 产出、策略注入示例、校验分层与入口依赖
- `docs/baseline.json` schema 2：区分 `mirrored`（仍与 donor 同字节）与 `diverged`（P1 有意改写）

## [0.1.0] - 2026-11-10

P0 快照基线。**仅搬运，无行为改动**，用于消除 `scxml-creator` 与 `node-red-contrib-scxmljs` 之间的源码复制。

### Added

- 包骨架：ESM 产物 + `.d.ts`，`exports` 提供 `.` 与 `./engine` 两个入口
- `src/core`：`model` / `serializer` / `action-parse` / `naming` / `scxml-import` / `examples` / `log`
  （逐字取自 donor `src/core` @ `6b5cfb6`）
- `src/engine`：`SessionRunner`（逐字取自 donor `src/engine` @ `cb00cfa`）
- 移植 3 个纯逻辑验证套件：`verify-import`、`smoke-engine`、`verify-timers`
- `docs/baseline.json`：快照哈希 + donor 出处 + 刻意排除清单
- `check:baseline`：快照漂移检测（可选逐字节比对 donor）
- `check:pack`：打包后在临时目录按 exports map 真实导入，验证发布物
- Gitea CI：Node 22.9 / 24 矩阵，跑类型检查、测试、构建、基线、打包冒烟

### Notes

- 未纳入本版本的 donor 文件及原因见 `docs/baseline.json` 的 `excluded` 字段：
  `validator.ts`（依赖引擎）、`events.ts`（含宿主概念）、`audit.ts`（服务端审计）、
  `storage.ts`（浏览器存储）、`stores` / `components` / `panels` / `viewhost`（P3 迁移）。
