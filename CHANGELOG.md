# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.13.0] - 2026-11-13

### Added

- `raise <event>` 动作：解析、编辑器动作行、序列化 `<raise>`、导入保留；
- `ProjectDoc.eventVisibility`：事件可标记为 `internal`（仅内部）或 `both`（默认）；
- internal-only 事件转移生成标准 SCXML 守卫：
  `_event.type === 'internal'`，外部同名事件不再触发；
- 事件面板显示真实来源（内部 raise、本机 send、自动延时、外部来源、仅监听）和可见性下拉；
- 编辑器外部注入 internal-only 事件时提前拒绝并写日志；
- 混合可见性转移 warning：`structure.transition.mixed-event-visibility`。

### Changed

- `raise` 导入不再降级为普通 `<send>`；
- 自产 SCXML 的 internal-only 转移新增 `data-kit-visibility="internal"` 和守卫条件；
- 自动延时事件继续按 external 处理，不参与 internal-only 守卫，避免破坏定时转移。

### Tests

- 新增 `test/verify-event-visibility.ts`：raise、守卫、外部拦截、自动延时例外、round-trip、来源通道；
- `check-vue` 覆盖事件来源与可见性下拉；
- `verify-editor` 覆盖 visible 设置与外部注入拒绝。

## [0.12.0] - 2026-11-13

### Added

- 结构树支持 `compound` / `parallel` 状态折叠：默认展开，过滤时强制展开命中路径，
  选中隐藏后代自动展开祖先；折叠状态只在当前编辑会话内保存；
- `features.resizablePanes` 的左右折叠按钮移到分割线纵向中点，按钮不随左栏滚动，
  收起态仍可操作，并补充 `aria-expanded` / `aria-label`；
- 横向布局方向切换后自动 fit，画布按内容动态扩容，fit 下限降到 0.1；侧栏 resize
  不强制重置用户缩放。
- 「运行」不再自动弹出「草稿包含自定义 JS」模态框，只在日志中记录检测数量；
  点击「校验」仍会显示该信息弹窗。

### Fixed

- 横向布局下状态机左右溢出、滚轮/左键无法露出被裁内容的问题：画布尺寸与视口尺寸
  分离，不再用 `.canvas.scrollWidth` 当内容尺寸。

### Tests

- `check-vue` 增加结构树折叠、过滤展开、选中隐藏后代自动展开用例；
- `verify-editor` 增加 canvas-fit 纯函数断言；
- 横向布局、fit、滚轮/拖拽和分割线把手通过 Chromium 真实浏览器检查。

## [0.11.0] - 2026-11-12

### Added

- `RunnerDoneEvent.states`：携带进入终态前的最后一批状态（至少包含顶层 final id）；
- `SessionRunner` 在 `done` 前发一次终态 `active`，`done` 后不再发空 `active: []`；
- `RunnerErrorEvent` 增加可选 `stateId` / `transitionId` / `slot` / `actionIndex` /
  `element`，可从运行时错误定位到状态、动作或转移；
- 错误定位只使用 DOM Level 1 API，兼容 `@xmldom/xmldom` 的 Node 环境；新增 xmldom 回归用例；
- 序列化器为转移写 `data-kit-transition-id`，导入器保留该属性，保证自产 SCXML
  round-trip 与错误定位稳定；
- `CreateEditorOptions.diagnostics`：可注入 `formatNamingIssue` /
  `formatStructureIssue` / `formatValidationIssue` / `formatImportWarning` /
  `formatVariableResult`；
- `CreateEditorOptions.locale: 'en'` 与 `DEFAULT_LABELS_EN`；
- 公开诊断 code 目录：`NAMING_ISSUE_CODES`、`STRUCTURE_ISSUE_CODES`、
  `IMPORT_WARNING_CODES`、`VALIDATION_ISSUE_CODES`、`VARIABLE_WRITE_CODES`、
  `DOCUMENT_STRUCTURE_ERROR_CODES`。

### Changed

- `done` 后不再发送空 `active`，宿主可删除 `status === 'done'` 过滤；
- 自产 SCXML 的 `<transition>` 新增 `data-kit-transition-id` 属性；
- 编辑器英文 labels/诊断文案可通过预设和注入完成，不再需要整份覆盖中文表。

### Tests

- `verify-host-events` 增加 done.states、终态 active、entry/transition error 定位、
  serializer transition id 用例；
- `verify-validation` 增加诊断 code 目录与 `docs/messages.md` 一致性检查；
- `verify-editor` 增加 locale=en 与 diagnostics 注入用例。

## [0.10.1] - 2026-11-12

### Added

- `features.resizablePanes`：左右栏可拖拽调宽（双击复位）、可折叠；默认关闭，保持现有布局
- preview 容器：默认每 3 秒检查文件 mtime 自动刷新；支持 `PREVIEW_TOKEN` 访问保护

### Changed

- 文档信息架构改为宿主集成优先：README 重新组织为安装、入口选择、core/engine/editor 快速开始；
  新增 `docs/host-integration.md` 与 `docs/README.md`
- `AGENTS.md` 改为维护者/Agent 入口，移除阶段表；阶段历史、架构复盘、需求记录、发布流程
  移入 `docs/internal/`
- `docs/editor.md`（原 `editor-p3.md`）与 `docs/session-events.md`（原 `host-events.md`）
  改为宿主视角文档

## [0.10.0] - 2026-11-11

### Added

- 转移属性面板可编辑 target 与 `transitionType`（internal/external），改 target 自动重算延时事件名
- `DoneDataEditor`：final 状态的 `<donedata>` 支持 content / expr / param 三种形态的完整编辑
- `features.explorer`：可选接入官方 `<scxml-explorer>`；编辑态使用未 start 的预览 session，
  仿真态跟随运行会话；点击状态同步选中，覆盖层转移列表可选中转移；
  `EditorAdapter.explorerStrings` 可覆盖界面文案（默认关闭）
- 结构面板在选中变化时自动滚动到对应状态/转移行
- `preview/` 只读预览容器：多阶段 Dockerfile、`/api/latest` 读取最新 `.scxml/.json`、
  只读编辑器 + 仿真 + Explorer；附 compose、示例数据与 `preview:build`/`preview:serve` 脚本
- `canvas-select.ts`：画布标签匹配抽成纯函数，新增 targetless chip / 条件截断回归测试
- 结构校验：donedata param name 必须为 NCName 且不可重复

### Changed

- Vue 构建将 `@tinyactors/scxmljs/explorer` 作为 external，按需动态加载，不重复打包 explorer
- 更新 `docs/editor.md` 的 0.10 状态说明

### Compatibility

- `ProjectDoc` / SCXML 输出不变；A/B/C 均为编辑器增量能力
- `features.explorer` 为可选字段，默认 `false`，不改变现有宿主行为
- 编辑态 Explorer 的预览 session 不 start，不执行 entry/exit、定时器或 send

## [0.9.1] - 2026-11-11

### Fixed

- `check:pack` 在 `npm publish --dry-run` 下失败：嵌套 `npm pack` 不再继承
  `npm_config_dry_run`，发布前预演可正常完成
- 结构校验新增 final 状态出边检查（`structure.state.final-transition`），避免非法
  `<final>` 出边进入引擎后才报错

### Changed

- `package.json` 补充 `repository` / `homepage` / `bugs` 元数据
- 更新 `docs/internal/releasing.md` 到 0.9.x 实际发布流程（含 2FA、processing、tag/远程约定）

## [0.9.0] - 2026-11-11

### Added

- `StateNode.doneData`：final 状态的 `<donedata>` 文档模型，支持 content / expr / param
  三种形态；`scxmlToDoc` / `serializeToScxml` 无损往返（KIT-003）
- 无 target 的内部转移：`TransitionEdge.target` 可为 `null`，新增
  `transitionType?: 'internal' | 'external'`；导入保留、序列化省略 target、
  `type="internal"` 经 roundtrip 保留（KIT-004）
- 编辑器：结构面板可新建「无目标（内部转移）」；画布可选中 targetless chip；
  终态属性面板可编辑 `doneData.expr`，导入的 content/param 只读保留
- 新增结构诊断：donedata 限 final / 空 / 多形态 / param 非法，
  history 默认转移无 target，targetless 无事件 warning

### Changed

- **BREAKING**：`TransitionEdge.target` 由 `string` 改为 `string | null`；
  `ListenEdge.target` 与 `EventOrigin` 的 `target` 同步可空
- `EditorStore.stateName(uid)` 接受 `string | null`，null 返回「（内部转移）」
- `EditorStore.addTransition` 的 `targetUid` 接受 `string | null`
- `import.transition.no-target` 不再发出（无 target 转移会被保留）
- `import.element.unsupported` 现在只用于 invoke 等仍不支持的元素

### Compatibility

- `scxml-creator` 等宿主若直接访问 `transition.target`，需处理 null；`^0.9.0` 升级前先适配
- 旧存档（target 始终为字符串、无 doneData）保持兼容，`normalizeDoc` 会补齐默认值
- `src/core/model.ts` / `src/core/serializer.ts` 由 donor mirrored 转为 diverged；
  `test/smoke-engine.ts` 同步转为 diverged（仅注释更新）

## [0.8.1] - 2026-11-11

### Fixed

- 编辑器左栏「结构」页在状态/转移较多时无法纵向滚动（KIT-001）：`.sce-side-left`
  建立独立滚动上下文，右侧属性栏滚动行为不变

## [0.8.0] - 2026-11-11

### Added

- `RunnerSendEvent` 新增 `target` / `sendid` 透传
- `RunnerDoneEvent`（含 donedata）与 `RunnerErrorEvent`（`kind` / `message`）
- `test:host-events` 覆盖 typed send/done/error 与监听器隔离

### Compatibility

- `RunnerEvent` 是联合类型；使用 `never` 穷举的下游 switch 需要补充分支
- 未加入 `sendType` / `error.element`：需要时再作为可选字段扩展
- 编辑器、creator 和现有日志/生命周期行为不变

## [0.7.5] - 2026-11-11

### Changed

- 新增 `features.events`；事件页在没有宿主 eventFields 时仍可显示发送/接收/内部延时只读视图
- creator 移除 `broadcast` 事件字段；旧 broadcast/ge_ 在服务端迁移为 `target=all` 路由
- 事件页不再出现跨机广播 checkbox，广播能力统一由事件路由表达

## [0.7.4] - 2026-11-11

### Changed

- 事件页按方向分组：发送事件（可配置广播）、接收事件（只读来源）、内部延时事件（只读）
- 内部延时事件不再出现在普通发送/接收事件表，也不提供广播/路由配置
- creator 迁移层清理内部延时事件的历史广播属性，运行时广播判定显式跳过 auto-delay 事件

## [0.7.3] - 2026-11-11

### Fixed

- 赋值动作改为两行：变量选择独占一行、表达式独占一行，避免变量框被压没
- `内部延迟` 更名 `延时触发`，结构面板标签不再换行（同一行显示 checkbox + 数值 + 单位）
- 新增 `check-ui-layout` 浏览器回归

## [0.7.2] - 2026-11-11

### Fixed

- 适应窗口时隐藏官方 `<scxml-view>` 宿主的边框/圆角/背景，消除画布边界线
- 新增 `check-canvas-select` 样式回归（border/radius/background）

## [0.7.1] - 2026-11-11

### Fixed

- 工具栏保存状态固定宽度，状态文案变化不再挤动撤销/部署等按钮
- 右侧标签栏恢复为圆角标签页样式，不再呈现为四个紧贴按钮
- 变量与事件属性拆为「变量」「事件」两个标签页；事件标签仅在宿主注册
  `eventFields` 时显示
- 事件属性改为表头 + 固定列布局，广播 checkbox 垂直居中；变量行支持换行

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
- `docs/editor.md`：入口、adapter 契约、构建、P4 迁移边界

### Changed

- `sideEffects` 改为 `["./dist/vue.js", "*.css"]`
- `npm run build` 拆为 `build:core`（tsup）+ `build:vue`（Vite + vue-tsc + 样式复制）
- `npm run typecheck` 追加 `vue-tsc`
- `verify:all` 追加 `check:vue`；CI 增加 Vue smoke 步骤

### Notes

- 编辑器不读 localStorage、不发 HTTP；默认浏览器适配器可被宿主整体替换。
- P3 的画布只做 source/session 同步；点击选中、缩放平移、Explorer 与结构化动作编辑器
  留在 P4（见 `docs/editor.md` §6）。

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
- `docs/internal/architecture-review.md`：分层、15 项隐患与 6 项剩余风险
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
