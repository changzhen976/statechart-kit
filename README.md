# statechart-kit

状态图（statechart）的建模与运行工具集：文档模型、SCXML 序列化与导入、命名策略、事件目录、结构校验、会话驱动。

> **边界声明**：本包**生成并驱动** SCXML，但**不解释** SCXML。
> 解释器与渲染器是 [`@tinyactors/scxmljs`](https://www.npmjs.com/package/@tinyactors/scxmljs)，本包是它上面的一层。

```
        你的应用 / Node-RED 节点 / 编辑器宿主
                        │
                  statechart-kit          ← 本包：文档模型、序列化、导入、命名、会话驱动、编辑器 UI
                        │  输出 SCXML / 驱动会话
                        ▼
              @tinyactors/scxmljs         ← 依赖：SCXML 1.0 解释器 + <scxml-view> 渲染器
```

## 属于本包 vs 不属于本包

| 属于本包 | 不属于本包（留在各宿主） |
| --- | --- |
| 状态图文档模型 `ProjectDoc` | 全局变量注册表 |
| SCXML 序列化 / 导入 / 结构校验 | MQTT 桥与规则 |
| 命名策略 `NamingPolicy`（可注入） | 服务端时钟、事件路由 |
| 本地事件目录 / 激活树 | 外部事件来源抓取与展示文案 |
| 会话运行与回放控制 | REST 接口 / 持久化 |
| 编辑器 UI（P3 起） | Node-RED 节点与事件总线 |

## 状态：P2 —— 引擎选项与生命周期加固

P0 是 `scxml-creator` 的逐字快照；P1 在保持行为的前提下完成四件事（`0.2.0`）：

1. **命名策略外置**：core 不再硬编码 `gv_`/`ge_`/`t_`/`mqe_`/`mqv_`/`sys.`。
   `NamingPolicy` 由宿主注入，core 只提供 `BASE_POLICY`；服务端兼容预设在
   [`statechart-kit/policies/server`](src/policies/server.ts)。
2. **校验分层**：`validateStructure(doc)`（core，零依赖）只查文档结构；
   `validateAgainstEngine(doc)` / `validateScxml(src)`（engine）跑 parse + compile；
   `validateDocument(doc)` 把结构 → 命名 → 引擎串起来。
3. **文案 code 化**：命名、导入、校验诊断统一返回 `{ code, params }`，不再返回中文
   字符串；宿主按 code 本地化（见 [`docs/messages.md`](docs/messages.md)）。`ACTION_KINDS`
   的 label 也改为消息 code。
4. **事件模块拆分**：文档事件事实 / 三方向目录 / 激活树进入 core
   （`event-catalog.ts`、`active-tree.ts`）；时钟/路由/MQTT 来源与展示文案留在宿主。

逐字搬运文件（`model`/`serializer`/`examples` 与两个 P0 测试）仍由
`npm run check:baseline` 保证与 donor 同字节；P1/P2 改写的文件记录在 `docs/baseline.json`
的 `diverged` 字段。

P2（`0.3.0`）把 engine 补齐为可独立消费的运行时：

- **引擎选择**：`engine: 'sandboxed' | 'trusted'`，默认 sandboxed；入口不静态 import 任一实现，
  首次使用才按 mode 动态加载（sandboxed 额外预热 QuickJS）。
- **选项透传**：`scriptTimeoutMs`、`maxMicrosteps`、`memoryLimitBytes`。
- **`data` 预置**：启动前覆盖 `<data>` 初始值（持久化变量恢复），`start()` 可再按次覆盖。
- **生命周期加固**：并发 `start` / 加载中 `stop` 不泄漏会话；监听器逐个隔离；初始 `active`
  只派发一次；启动失败回到 idle。
- **结构化变量写入**：`assignVariable` / `assignValue` 返回 `{ ok, code, params }`。
- **严格序列化**：`serializeChecked(doc)` 在结构 error 时抛 `DocumentStructureError`。
- 详细梳理与隐患清单见 [`docs/architecture-review-p2.md`](docs/architecture-review-p2.md)。

## 安装与使用

```sh
npm install statechart-kit
```

```ts
import {
  BASE_POLICY,
  checkEventName,
  emptyDoc,
  serializeToScxml,
  validateStructure,
} from 'statechart-kit'

const doc = emptyDoc('demo')
// ... 编辑 doc ...
const report = validateStructure(doc)        // 纯结构，不依赖引擎
const xml = serializeToScxml(doc)            // 交给 @tinyactors/scxmljs 运行

// 命名规则由宿主注入；BASE_POLICY 不含任何服务端前缀
const issue = checkEventName(BASE_POLICY, 'anything')
```

```ts
import { SERVER_POLICY } from 'statechart-kit/policies/server'
import { validateDocument, SessionRunner } from 'statechart-kit/engine'

const result = await validateDocument(doc, {
  policy: SERVER_POLICY,       // 服务端预设：gv_/ge_/t_/mqe_/mqv_/sys./g_
  domParser,                   // Node 环境必须注入（happy-dom / linkedom）
})
if (!result.ok) {
  for (const issue of result.issues) {
    // issue.code + issue.params → 宿主本地化；issue.kind/stateId/event 用于定位
  }
}
```

### 入口

| 入口 | 内容 | 运行时依赖 |
| --- | --- | --- |
| `statechart-kit` | 文档模型、序列化、导入、命名策略、事件目录、结构校验、日志类型 | 无 |
| `statechart-kit/engine` | `SessionRunner`、`loadEngine`/`preloadEngine`/`createEngineSession`、`validateScxml`/`validateDocument` | `@tinyactors/scxmljs`（按 mode 动态加载） |
| `statechart-kit/policies/server` | 服务端命名策略预设 `SERVER_POLICY`（不属于 core） | 无 |

### 引擎选择与选项

```ts
import { preloadEngine } from 'statechart-kit/engine'
import { SessionRunner } from 'statechart-kit/engine'

await preloadEngine('sandboxed') // 可选：提前加载 QuickJS，首次 start 不再等待

const runner = new SessionRunner({
  engine: 'sandboxed',        // 用户图表；trusted 只用于完全可信的图表
  domParser,                  // Node 必须注入
  scriptTimeoutMs: 500,
  maxMicrosteps: 10_000,
  data: restoredVars,         // 启动前覆盖 <data>，避免 entry 先跑
})

await runner.start(xml, { data: { count: 3 } }) // 本次启动再覆盖
runner.on((ev) => {
  if (ev.type === 'log' && ev.entry.kind === 'error') console.error(ev.entry.text)
})
await runner.settled()
```

| 选项 | 作用域 | 默认 | 说明 |
| --- | --- | --- | --- |
| `engine` | 两者 | `sandboxed` | trusted 在宿主 JS realm 中运行，**不是安全沙箱** |
| `scriptTimeoutMs` | sandboxed | 引擎 2000ms | 单次脚本/表达式求值上限；trusted 忽略 |
| `memoryLimitBytes` | sandboxed | 引擎 64MiB | QuickJS 会话内存上限；trusted 忽略 |
| `maxMicrosteps` | 两者 | 引擎 100000 | 单个宏步上限，超出触发 `error.platform` 并停止 |
| `data` | 两者 | 无 | 启动前覆盖 `<data>`；`start()` 的 data 浅合并覆盖构造器 |

> `trusted` 不做隔离：图表脚本可触达宿主环境。只有你能完全信任图表来源时才使用；
> 用户可编辑/可上传的图表必须用默认的 `sandboxed`。

### 自定义命名策略

```ts
import type { NamingPolicy } from 'statechart-kit'

const policy: NamingPolicy = {
  key: 'my-app',
  namespaces: [
    { key: 'appVar', prefix: 'av_', event: 'block', variable: 'allow' },
    { key: 'appEvent', prefix: 'ae_', event: 'allow', variable: 'block', broadcast: true },
  ],
}
```

前缀、允许/拦截/警告、广播与路由保留语义全部由 `NamingNamespace` 描述；core 只做
最长前缀匹配。`legacy` 命名空间仅在没有匹配到其他前缀时生效，因此 `gv_x` 不会误判为
`g_`。迁移钩子（`migration.eventName/variableName/expression`）同样由宿主提供。

## 开发

```sh
npm install
npm run typecheck     # tsc --noEmit
npm test              # 7 个纯逻辑验证套件（P0 三个 + P1 三个 + P2 引擎）
npm run build         # tsup → dist（ESM + d.ts）
npm run verify:all    # 类型 + 测试 + 构建 + 基线 + 打包冒烟
```

| 命令 | 作用 |
| --- | --- |
| `npm run test:naming` | 命名策略、自定义策略注入、部署闸门、迁移、core 前缀守卫 |
| `npm run test:events` | 事件事实、三方向目录、激活树 |
| `npm run test:validation` | 结构校验、引擎校验、分层拦截、严格序列化、core 无引擎依赖守卫 |
| `npm run test:engine` | 懒加载器、两种数据模型、data 预置、生命周期竞态、监听器隔离、timeout/microsteps、变量 code |
| `npm run freeze:baseline` | 重新冻结受保护文件哈希；仅在有意变更后执行 |
| `npm run check:baseline` | 校验本仓与基线一致；加 `-- --donor` 只对 `mirrored` 文件逐字节比对 donor |
| `npm run check:pack` | 打包后在临时目录按 exports map 真实导入一次，验证发布物可用 |

## 版本策略

- 语义化版本；`0.x` 期间 minor 可含破坏性变更，破坏性变更必须写进 `CHANGELOG.md`。
- 消费方（`scxml-creator`、`node-red-contrib-scxmljs`）应在同一时间 pin 同一版本，避免快照漂移。
- 每个阶段的完成点打 tag：`v0.1.0` = P0 快照基线，`v0.2.0` = P1 策略/校验/消息 code，`v0.3.0` = P2 引擎选项。

## 路线图

见 [`docs/roadmap.md`](docs/roadmap.md)。P3 进入 Vue 编辑器抽离（`EditorHost` / `features` /
`mountEditor`）；P2 的架构梳理见 [`docs/architecture-review-p2.md`](docs/architecture-review-p2.md)。

## License

MIT
