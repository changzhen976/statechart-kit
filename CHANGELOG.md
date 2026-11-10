# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Planned (P2)

- `SessionRunner` 补齐 `scriptTimeoutMs` / `maxMicrosteps`
- `data` 预置与 trusted/sandboxed 入口选择
- 合并懒加载器

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
