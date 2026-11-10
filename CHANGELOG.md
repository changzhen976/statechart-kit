# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Planned (P1)

- 命名规则外置为 `NamingPolicy`：服务端语义（`gv_`/`ge_`/`t_`/`mqe_`/`mqv_`/`sys.`）不再写进 core
- 校验分层：`validateStructure`（core，零依赖）与 `validateAgainstEngine`（engine）
- core 文案改为 `{ code, params }`，由宿主本地化
- `events.ts` 拆分为「本地事件目录（core）」与「外部来源（宿主）」

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
