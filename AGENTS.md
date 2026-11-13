# AGENTS.md — statechart-kit 维护者/Agent 入口

> 本文件是维护者与自动化工具进入仓库的入口。宿主集成请先读 [`README.md`](README.md) 与
> [`docs/host-integration.md`](docs/host-integration.md)；本文件只描述当前代码约定、
> 架构不变量、测试与维护流程。

## 1. 项目是什么

`statechart-kit` 是状态图的建模、校验与运行工具集：

- 文档模型 `ProjectDoc`、SCXML 序列化 / 导入、结构校验；
- 命名策略 `NamingPolicy`（宿主注入，core 只提供 `BASE_POLICY`）；
- 本地事件目录 / 激活树；
- 会话驱动 `SessionRunner`（sandboxed / trusted）；
- 可嵌入 Vue 编辑器（`statechart-kit/vue`）；
- 只读预览容器（`preview/`，不属于 npm 包）。

**边界**：本包生成并驱动 SCXML，但**不解释** SCXML。解释器/渲染器是
`@tinyactors/scxmljs`。全局变量注册表、MQTT 桥、服务端时钟、事件路由、REST、
Node-RED 节点与总线、部署与草稿锁都不在本包范围内。

## 2. 当前发布

| 项 | 值 |
| --- | --- |
| 版本 | `0.12.0` |
| 分支 | `main` |
| 入口 | `.` / `./engine` / `./vue` / `./diagnostics/zh` |
| Node | `>=20` |
| 运行时依赖 | `@tinyactors/scxmljs` |
| Vue | optional peer `^3.5` |
| 诊断 | `{code, params}`，中文格式化在 `diagnostics/zh` |

兼容性注意：

- `TransitionEdge.target` 可为 `null`；`ListenEdge.target` / `EventOrigin.target` 同步可空；
- `features.explorer` 默认 `false`；
- 0.x minor 可含破坏性变更，必须写进 `CHANGELOG.md`。

## 3. 快速命令

```bash
npm install
npm run typecheck     # tsc --noEmit && vue-tsc --noEmit
npm test              # 9 个套件
npm run build         # tsup(core/engine/diagnostics) + Vite(Vue) + vue-tsc d.ts
npm run verify:all    # typecheck + test + build + baseline + vue + pack
npm run check:pack    # 真实打包/解包，按 exports map 导入
npm run check:vue     # happy-dom 中挂载 dist/vue.js（含 Explorer 回归）
npm run preview:build # 只读预览容器的前端构建
npm run preview:serve # 本地运行 preview 容器服务
```

单独套件：`test:import` / `test:smoke` / `test:timers` / `test:naming` /
`test:events` / `test:validation` / `test:engine` / `test:editor` / `test:host-events`。

本机 npm 默认 cache 可能只读：

```bash
npm install --cache .npm-cache --logs-dir /tmp/npm-logs
npm view <pkg> --cache .npm-cache --logs-dir /tmp/npm-logs
```

## 4. 代码地图

```text
src/core/                零运行时依赖；禁止 import 引擎/Vue/浏览器存储
  model.ts               ProjectDoc / StateNode / TransitionEdge / DoneData
  serializer.ts          文档 → SCXML（容忍式；预览用）
  serialize-checked.ts   结构 error 时抛 DocumentStructureError
  scxml-import.ts        SCXML → 文档 + {code,params} warnings
  cdata.ts               CDATA 中和（导入/校验/建会话共用）
  naming-policy.ts       NamingPolicy / BASE_POLICY
  naming.ts              策略驱动的命名校验
  migrate.ts             策略驱动的迁移骨架
  event-catalog.ts       事件事实/三方向目录
  active-tree.ts         激活状态层级树
  validate-structure.ts  纯结构校验（零依赖）
  codes.ts               公开诊断 code 目录
  examples.ts            内置示例（测试依赖）

src/engine/              依赖 @tinyactors/scxmljs；入口不静态 import 实现
  engine-loader.ts       loadEngine / preloadEngine / createEngineSession
  session-runner.ts      SessionRunner：生命周期/事件/变量
  validator.ts           validateScxml / validateAgainstEngine / validateDocument
  index.ts               导出

src/diagnostics/zh.ts    诊断 code → 中文展示（宿主可替换）

src/vue/                 Vue 3 编辑器（Vite 构建，vue 为 optional peer）
  index.ts               mountEditor / createEditor / EditorHost
  editor-store.ts        reactive store：文档 CRUD/undo/保存/校验/仿真；EditorDiagnostics + locale
  canvas-fit.ts          大画布扩容与 fit 比例纯函数
  types.ts               EditorAdapter（宿主能力注入）
  modules.ts             EditorModule 契约
  features.ts            EditorFeatures 能力开关（含 explorer）
  browser-adapter.ts     浏览器默认 adapter
  events.ts / labels.ts / format.ts / styles.css（含 DEFAULT_LABELS_EN）
  DoneDataEditor.vue     doneData 的 content/expr/param 编辑器
  canvas-select.ts       画布标签 → 转移匹配（纯函数）
  *.vue                  EditorHost/Toolbar/Structure/Canvas/Property/Variables/Sim

preview/                 只读预览容器（Docker，不属于 npm 包）
  server.mjs             /api/latest + 静态服务 + 健康检查
  web/                   mountEditor 只读页面
  Dockerfile / compose.yaml
```

构建顺序：`tsup` 会 clean `dist`，必须先 core 后 Vue。

## 5. 架构不变量

1. **core 零运行时依赖**：不 import `@tinyactors/scxmljs`、Vue、Node 内置或浏览器 API。
2. **命名策略注入**：core 不硬编码 `gv_`/`ge_`/`t_`/`mqe_`/`mqv_`/`sys.`/`g_`；
   服务端/MQTT 语义在宿主。
3. **诊断只返回 `{code, params}`**：core/engine 不返回中文文案；新增 code 更新
   `docs/messages.md`。
4. **engine 入口不静态 import 任一引擎实现**：一律通过 `engine-loader` 动态 import。
5. **Vue 编辑器不读 localStorage、不发 HTTP**：持久化/导入导出/外部事件/部署/退出
   全部走 `EditorAdapter`。
6. **不要引入 Pinia**：`reactive` store + `provide/inject`。
7. **样式集中**：组件不写 scoped style；统一 `src/vue/styles.css`。
8. **trusted 不是安全沙箱**：默认 `sandboxed`；用户可编辑图表必须 sandboxed。
9. **baseline**：`docs/baseline.json` 的 `mirrored` 文件必须与 donor 同字节；
   改源码后执行 `npm run freeze:baseline`。

## 6. 诊断 / API 速查

```ts
import { BASE_POLICY, checkEventName, validateStructure } from 'statechart-kit'
import { validateDocument, SessionRunner } from 'statechart-kit/engine'

const report = validateStructure(doc)             // { ok, issues }
const result = await validateDocument(doc, { policy, domParser })
const runner = new SessionRunner({ engine: 'sandboxed', domParser })
```

- 严格序列化：`serializeChecked(doc)`；预览用 `serializeToScxml(doc)`。
- 会话：`start(xml, { data })`；`send()` 返回 boolean；
  `assignVariable/assignValue` 返回 `{ ok, code, params }`。
- typed 事件：`send` / `done` / `error` / `active` / `log`；见
  [`docs/session-events.md`](docs/session-events.md)。

## 7. 测试与验收

| 套件 | 覆盖 |
| --- | --- |
| `test/verify-import.ts` | 示例/外部 SCXML round-trip |
| `test/smoke-engine.ts` | 引擎冒烟 |
| `test/verify-timers.ts` | 内部延时转移 |
| `test/verify-naming.ts` | 命名策略注入与 core 前缀守卫 |
| `test/verify-events.ts` | 事件事实/方向目录/激活树 |
| `test/verify-validation.ts` | 结构/引擎校验、严格序列化、CDATA |
| `test/verify-engine.ts` | 懒加载、两种数据模型、生命周期竞态 |
| `test/verify-host-events.ts` | typed send/done/error、done.states、error 定位 |
| `test/verify-editor.ts` | adapter、CRUD/undo、Explorer 匹配、doneData、locale/diagnostics、canvas-fit |

发布前必须 `npm run verify:all` 全绿。`check:baseline -- --donor` 需要本地
`../scxml-creator` donor 工作区，仅开发机可用。

## 8. 改动流程

1. 读本文件 §5 与 [`docs/host-integration.md`](docs/host-integration.md)；
   修改公开 API/适配器契约时同步 README 和对应 docs。
2. 保持 ESM、2 空格、无分号、单引号、`verbatimModuleSyntax`。
3. `npm run typecheck && npm test`；涉及 Vue 再 `npm run build:vue && npm run check:vue`。
4. 更新 `CHANGELOG.md`；公开 API/诊断 code/构建入口变化必须写。
5. `npm run freeze:baseline`（源码变更后）。
6. `npm run verify:all`。
7. 版本：0.x minor 可含破坏性变更；`npm version x.y.z --no-git-tag-version`，
   提交后打 tag。

不要提交：`node_modules/`、`dist/`、`.npm-cache/`、`.tmp/`、`*.tgz`、`preview/dist/`。

## 9. 维护者内部文档

以下文档保留历史阶段、架构复盘、需求与发布细节，**不作为宿主集成入口**：

- [`docs/internal/roadmap.md`](docs/internal/roadmap.md)：阶段历史与迁移清单；
- [`docs/internal/architecture-review.md`](docs/internal/architecture-review.md)：历史架构分层与风险；
- [`docs/internal/kit-requirements.md`](docs/internal/kit-requirements.md)：KIT-001–014 需求记录（KIT-012–014 已在 0.12.0 实现）；
- [`docs/internal/releasing.md`](docs/internal/releasing.md)：npm 发布与 creator 切换；
- [`docs/internal/work-items/`](docs/internal/work-items/)：历史工作项。

donor / baseline 说明：`docs/baseline.json` 记录受保护文件哈希；`mirrored` 与
`../scxml-creator` 历史提交同字节，`diverged` 为有意改写。

## 10. 已知接受风险

- 运行日志（lifecycle/send/error）仍是自由中文文本；typed 事件提供结构，宿主自行本地化。
- 引擎 `error.*` 原始 message 在 `params.detail`，不做稳定格式承诺。
- `serializeToScxml` 容忍半成品；部署/运行路径必须用 `serializeChecked` 或先校验。
- QuickJS 内部加载失败无法重置（上游行为）；ESM loader 缓存可重试。
- 同一包被 bundler 复制成多份时各自有 loader 缓存；构建侧去重。
- KIT-002 / KIT-005 属于 `@tinyactors/scxmljs` 上游问题，不在 kit 修复。

## 11. 远程 / 环境

- 内部开发仓库：团队 Gitea。
- 公开镜像：`git@github.com:changzhen976/statechart-kit.git`。
- 相关宿主：`../scxml-creator`（编辑器/服务示例）、`../node-red-contrib-scxmljs`（Node-RED 宿主）。
  未接到任务时不要修改它们。
