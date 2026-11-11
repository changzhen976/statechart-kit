# AGENTS.md — statechart-kit 项目状态与协作约定

> 本文件是 agent / 自动化工具进入本仓库的**第一入口**。开始任何改动前先读本文件、
> `docs/roadmap.md` 与最近一次 `CHANGELOG.md`。文档使用中文，代码标识符/诊断 code 使用英文。

## 1. 项目是什么

`statechart-kit` 是状态图（statechart）的建模与运行工具集：

- 文档模型 `ProjectDoc`、SCXML 序列化 / 导入、结构校验；
- 命名策略 `NamingPolicy`（宿主注入，core 只提供 `BASE_POLICY`）；
- 本地事件目录 / 激活树；
- 会话驱动 `SessionRunner`（sandboxed / trusted 两种数据模型）；
- 可嵌入 Vue 编辑器（`statechart-kit/vue`）。

**边界**：本包生成并驱动 SCXML，但**不解释** SCXML。解释器/渲染器是
`@tinyactors/scxmljs`，本包是它上面的一层。全局变量注册表、MQTT 桥、服务端时钟、
事件路由、Fastify REST、Node-RED 节点与总线都不在本包范围内。

## 2. 当前状态快照

| 项 | 值 |
| --- | --- |
| 版本 | `0.7.2`（P4.2：UI 收尾 + 适应窗口无边界线） |
| 分支 | `main` |
| 远程 | 内部 Gitea；公开镜像 GitHub（见 §11） |
| P3 提交 | `0257756 feat(p3): add embeddable Vue editor with adapter-driven host boundary` |
| 已完成阶段 | P0 快照、P1 策略/校验、P2 引擎选项、P3 Vue 编辑器、P4 scope cleanup + EditorModule、P4.1 通用变量/事件属性 |
| 阶段 | P4.2 完成：UI 收尾（固定状态位/标签页/事件面板） |

阶段路线图与估时见 `docs/roadmap.md`；P3 迁移边界见 `docs/editor-p3.md`；
P2 架构梳理/隐患清单见 `docs/architecture-review-p2.md`；诊断 code 契约见
`docs/messages.md`。

## 3. 快速命令

```bash
npm install
npm run typecheck     # tsc --noEmit && vue-tsc --noEmit
npm test              # 8 个套件（P0 3 + P1 3 + P2 1 + P3 1）
npm run build         # tsup(core/engine/policies) + vite(Vue) + vue-tsc d.ts + 样式复制
npm run verify:all    # typecheck + test + build + baseline + check:vue + check:pack
npm run check:pack    # 真实打包/解包，按 exports map 导入
npm run check:vue     # happy-dom 中挂载 dist/vue.js
```

单独套件：`test:import` / `test:smoke` / `test:timers` / `test:naming` /
`test:events` / `test:validation` / `test:engine` / `test:editor`。

本机 npm 默认 cache 可能只读：

```bash
npm install --cache .npm-cache --logs-dir /tmp/npm-logs
npm view <pkg> --cache .npm-cache --logs-dir /tmp/npm-logs
```

## 4. 代码地图

```text
src/core/                零运行时依赖；禁止 import 引擎/Vue/浏览器存储
  model.ts               ProjectDoc / StateNode / TransitionEdge / uid
  serializer.ts          文档 → SCXML（容忍式；半成品预览用）
  serialize-checked.ts   serializeChecked(doc)：结构 error 时抛错
  scxml-import.ts        SCXML → 文档 + {code,params} warnings
  cdata.ts               CDATA 中和（导入/校验/建会话共用）
  naming-policy.ts       NamingPolicy / NamingNamespace / BASE_POLICY
  naming.ts              策略驱动命名校验（checkEventName/checkVarName/checkDocNaming）
  migrate.ts             策略驱动的 v1→v2 迁移骨架
  event-catalog.ts       事件事实/三方向目录/广播标记
  active-tree.ts         激活状态层级树
  validate-structure.ts  纯结构校验（零依赖）
  log.ts                 日志条目类型/截断/归一
  examples.ts            内置示例（含中文状态名，测试依赖）

src/engine/              依赖 @tinyactors/scxmljs；入口不静态 import 实现
  engine-loader.ts       loadEngine / preloadEngine / createEngineSession（按 mode 懒加载）
  session-runner.ts      SessionRunner：回放/事件桥/变量/生命周期
  validator.ts           validateScxml / validateAgainstEngine / validateDocument
  index.ts               导出上述

src/diagnostics/zh.ts    通用诊断 code → 中文展示（宿主可再包一层自己的 code）

# 服务端/MQTT 命名策略不在 kit：scxml-creator/src/policy/server.ts 由宿主维护

src/vue/                 Vue 3 编辑器（Vite 构建，vue 为 optional peer）
  index.ts               mountEditor / createEditor / EditorHost（公开入口）
  editor-store.ts        reactive store：文档 CRUD/undo/保存/校验/仿真/确认
  types.ts               EditorAdapter（宿主能力注入）
  modules.ts             EditorModule 契约（上层功能以模块注入）
  features.ts            EditorFeatures 能力开关
  browser-adapter.ts     浏览器默认实现（localStorage/文件/示例）
  format.ts              诊断 code → 中文展示
  events.ts              事件候选（展示层）
  labels.ts              默认中文文案
  styles.css             全部编辑器样式 → dist/vue/style.css
  *.vue                  EditorHost/Toolbar/Structure/Canvas/Property/Variables/Sim/...
```

构建/发布：

- `tsup`：`.`, `./engine`, `./diagnostics/zh` → `dist/*.js` + d.ts。
- `vite`：`src/vue/index.ts` → `dist/vue.js`（`vue`、`@tinyactors/*` external）。
- `vue-tsc -p tsconfig.vue-dts.json` → `dist/vue-types/**`；`exports["./vue"].types` 指向
  `dist/vue-types/vue/index.d.ts`。
- `scripts/copy-vue-assets.mjs` → `dist/vue/style.css`。
- **构建顺序不能反**：`tsup` 会 clean `dist`；必须先 core 后 vue。

## 5. 必须保持的架构不变量

1. **core 零运行时依赖**：不 import `@tinyactors/scxmljs`、Vue、Node 内置或浏览器 API。
   `verify-validation` 有静态守卫。
2. **命名策略注入**：core 源码不得硬编码 `gv_`/`ge_`/`t_`/`mqe_`/`mqv_`/`sys.`/`g_`；
   服务端/MQTT 语义只在宿主（`scxml-creator/src/policy/server.ts`）。`verify-naming`
   用测试夹具守卫策略引擎，不再随包发布服务端策略。
3. **诊断只返回 `{code, params}`**：core 不返回中文文案；中文解释在
   `src/vue/format.ts` 或宿主 i18n。新增 code 视为公开 API，更新 `docs/messages.md`。
4. **engine 入口不静态 import 任一引擎实现**：一律通过 `engine-loader` 动态 import；
   validator 复用同一 trusted 模块。`verify-engine` 有静态守卫。
5. **Vue 编辑器不读 localStorage、不发 HTTP**：持久化/导入导出/外部事件/部署/退出全走
   `EditorAdapter`。默认浏览器适配器可被整体替换。
6. **不要引入 Pinia**：编辑器是 `reactive` store + `provide/inject`；避免把应用状态框架
   带进宿主。
7. **样式集中**：组件不写 scoped style；统一 `src/vue/styles.css`，宿主显式 import
   `statechart-kit/vue/style.css`。
8. **trusted 不是安全沙箱**：默认 `sandboxed`；只有完全可信的图表才可 `engine: 'trusted'`。
9. **baseline**：`docs/baseline.json` 的 `mirrored` 文件必须与 donor 同字节；
   `diverged` 是有意改写。改源码后必须 `npm run freeze:baseline`，否则 CI 失败。

## 6. 诊断 / 命名 / 校验速查

```ts
import { BASE_POLICY, checkEventName } from 'statechart-kit'
import { validateDocument, SessionRunner } from 'statechart-kit/engine'
import type { NamingPolicy } from 'statechart-kit'

const policy: NamingPolicy = { key: 'host', namespaces: [/* 宿主命名空间 */] }
checkEventName(policy, 't_tick', { doc })   // { level, code, params } | null
validateDocument(doc, { policy, domParser })
```

- 结构校验：`validateStructure(doc)` → `{ ok, issues }`（error 阻断，warning 提示）。
- 严格序列化：`serializeChecked(doc)`；编辑器预览仍可用容忍式 `serializeToScxml`。
- 引擎校验：`validateScxml` → `{ ok, issues, source? }`；错误原文在 `params.detail`。
- 会话：`SessionRunner({ engine, domParser, scriptTimeoutMs, maxMicrosteps, data })`；
  `start(xml, { data })`；`send()` 返回 boolean；`assignVariable/assignValue` 返回
  `{ ok, code, params }`。

## 7. 测试与验收

| 套件 | 覆盖 |
| --- | --- |
| `test/verify-import.ts` | 示例 serialize→import→serialize 逐字节 |
| `test/smoke-engine.ts` | 引擎集成冒烟（激活/事件/变量/donedata/并行/历史/延时/动作） |
| `test/verify-timers.ts` | 内部延迟转移展开/折叠/行为 |
| `test/verify-naming.ts` | 策略注入、部署闸门、迁移、core 前缀守卫 |
| `test/verify-events.ts` | 事件事实/方向目录/激活树 |
| `test/verify-validation.ts` | 结构/引擎校验、严格序列化、CDATA、无 DOMParser |
| `test/verify-engine.ts` | 懒加载、两种数据模型、data 预置、生命周期竞态、监听器隔离 |
| `test/verify-editor.ts` | adapter、CRUD/undo、命名、校验/运行/停止、确认/保存 |

发布前必须 `npm run verify:all` 全绿。`check:baseline -- --donor` 需要本地
`../scxml-creator` donor 工作区，仅开发机可用。

## 8. 改动流程

1. 读 `docs/roadmap.md` 当前阶段 + 本文件 §5 不变量。
2. 改代码；保持 ESM、2 空格、无分号、单引号、`verbatimModuleSyntax`（类型导入用
   `import type`）。
3. `npm run typecheck && npm test`；涉及 Vue 再 `npm run build:vue && npm run check:vue`。
4. 更新 `CHANGELOG.md`；公开 API/诊断 code/构建入口变化必须写。
5. `npm run freeze:baseline`（源码变更后）。
6. `npm run verify:all`。
7. 版本：`0.x` minor 可含破坏性变更，用 `npm version x.y.z --no-git-tag-version`，
   提交后 `git tag vX.Y.Z`。

不要提交：`node_modules/`、`dist/`、`.npm-cache/`、`.tmp/`、`*.tgz`、`.local`。

## 9. P4 迁移进度与清单

目标：`scxml-creator` 改用本包并删除本地副本。

**已完成**：donor 删除本地 `src/core`、`src/engine`；改为 `statechart-kit` /
`statechart-kit/engine`；新增 `src/compat/{naming,validator}.ts` 与宿主
`src/{events,storage,audit}.ts`；`test:all` 与 9 个浏览器检查全绿；kit 新增
`diagnostics/zh`、`EditorModule` 契约，并把 `SERVER_POLICY` 迁回宿主。

**待完成**：file: 依赖改固定版本；Explorer 调试视图/侧栏拖拽等增强可按需作为模块补回。

1. core：把 donor `src/core/{model,serializer,action-parse,naming,scxml-import,storage,validator,events}.ts`
   替换为 `statechart-kit` 导入；`naming` 调用改策略优先签名，`events` 用
   `event-catalog` + 宿主展示层。
2. engine：donor `SessionRunner` 换成本包 `SessionRunner`；适配
   `assignVariable` 的 `{code,params}` 返回值与 `send` 布尔返回。
3. 编辑器：`scxml-creator/src/{components,panels,viewhost,stores}` 切到
   `statechart-kit/vue`；用 `EditorAdapter` 接现有 service store：
   - `load/save/importProject/exportProject/exportScxml` ← 现有 storage/service；
   - `externalEvents` ← 时钟/路由/MQTT 来源；
   - `deploy/exit` ← 草稿部署与退出守卫；
   - `readOnly` ← 草稿软锁/冲突。
4. P3 有意未搬、P4 要补的能力（见 `docs/editor-p3.md` §6）：
   - 画布点击选中转移、缩放/平移层（`ChartViewHost` 的 shadow DOM 契约）；
   - Explorer 逐层调试；
   - 结构化动作编辑器（当前 P3 是 textarea）；
   - 服务端机器绑定、草稿锁/冲突横幅、部署前守卫；
   - 全局变量/MQTT/路由出向 tip 文案。
5. 删除 donor 本地副本后跑 `test:all` / `check:all`，再更新 donor 的 `AGENTS`/README。

P5（node-red）再做：替换 `src/vendor/scxml-core` 与 17 条构建期压缩替换，改用
`statechart-kit` 的 serializer/importer/validator/engine loader。

## 10. 已知接受风险（不要误当 bug 修）

- 运行日志（`SessionRunner` lifecycle/send/error）仍是自由中文文本；P5 接 Node-RED 时统一
  i18n，不要在 core 里加文案。
- 引擎 `error.*` 的原始 message 放在 `params.detail`，不做稳定格式承诺。
- `serializeToScxml` 默认容忍半成品；部署/运行路径必须用 `serializeChecked` 或先
  `validateStructure`。
- QuickJS 内部加载失败无法重置（上游行为）；ESM loader 缓存可重试。
- 同一包被 bundler 复制成多份时各自有 loader 缓存；构建侧去重。

## 11. 远程 / 环境

- 内部开发仓库：团队 Gitea（地址、SSH key、token 不写入公开仓库）。
- 公开镜像：`git@github.com:changzhen976/statechart-kit.git`。
- 相关仓库：`../scxml-creator`（donor，P4 切换）、`../node-red-contrib-scxmljs`（P5 切换）。
  未接到任务时不要修改它们。
