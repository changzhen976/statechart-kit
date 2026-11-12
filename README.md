# statechart-kit

状态图（statechart）的建模、校验与运行工具集：文档模型、SCXML 序列化/导入、结构校验、
会话驱动，以及可嵌入的 Vue 编辑器。

> **边界**：本包**生成并驱动** SCXML，但**不解释** SCXML。
> 解释器与渲染器是 [`@tinyactors/scxmljs`](https://www.npmjs.com/package/@tinyactors/scxmljs)，
> 本包是它上面的一层。

```text
你的应用 / Node-RED 节点 / 编辑器宿主
                 │
           statechart-kit        ← 文档模型、序列化、导入、校验、会话、编辑器 UI
                 │  输出 SCXML / 驱动会话
                 ▼
      @tinyactors/scxmljs        ← SCXML 1.0 解释器 + <scxml-view> 渲染器
```

## 适合谁

- 需要在服务端/Node 程序中生成、导入、校验 SCXML 的宿主；
- 需要把状态图编辑器嵌入自己的 Vue 应用或管理后台的宿主；
- 需要在浏览器或 Node 中驱动状态图会话、回放事件、读取变量的宿主；
- 已经有自己的持久化、事件总线、MCP/MQTT/路由/部署体系，只想复用状态图能力的宿主。

## 包边界

| 属于本包 | 不属于本包（宿主实现） |
| --- | --- |
| `ProjectDoc` 文档模型 | 全局变量注册表 |
| SCXML 序列化 / 导入 / 结构校验 | MQTT 桥与规则 |
| `NamingPolicy`（宿主注入） | 服务端时钟、事件路由 |
| 本地事件目录 / 激活树 | 外部事件来源抓取与展示文案 |
| `SessionRunner` 会话驱动 | REST 接口 / 持久化 |
| Vue 编辑器与 `EditorAdapter` | Node-RED 节点/总线、部署、草稿锁 |
| 标准诊断 `{code, params}` | 宿主 i18n / 业务文案 |

## 安装

```bash
npm install statechart-kit
```

要求 Node.js >= 20，ESM only。Vue 是 optional peer，只使用 core/engine 的宿主不需要安装 Vue。

## 选择集成方式

| 宿主场景 | 使用入口 | 宿主需要提供 |
| --- | --- | --- |
| 只生成/导入/校验 SCXML | `statechart-kit` | 无 |
| 运行/回放状态图、接收 typed 事件 | `statechart-kit` + `statechart-kit/engine` | `domParser`（Node）、引擎选择、事件来源 |
| 嵌入 Vue 编辑器 | `statechart-kit/vue` | `EditorAdapter`、样式、可选的 `EditorModule` |
| 独立查看最新图 | `preview/` 容器 | 挂载 `.scxml` / `.json` 文件 |

更完整的职责矩阵、adapter 样例和生命周期见 [`docs/host-integration.md`](docs/host-integration.md)。

## Core：文档、导入、校验

```ts
import {
  emptyDoc,
  scxmlToDoc,
  serializeToScxml,
  validateStructure,
} from 'statechart-kit'

const doc = emptyDoc('demo')

const report = validateStructure(doc)   // 纯结构，不依赖引擎
const xml = serializeToScxml(doc)       // 交给 @tinyactors/scxmljs 运行

const imported = scxmlToDoc(xml)        // SCXML → ProjectDoc
if (!imported.warnings.length) {
  // 自产 SCXML 可无损 round-trip
}
```

命名规则由宿主注入，core 只提供 `BASE_POLICY`：

```ts
import { BASE_POLICY, checkEventName } from 'statechart-kit'
import type { NamingPolicy } from 'statechart-kit'

const policy: NamingPolicy = {
  key: 'my-host',
  namespaces: [
    { key: 'appVar', prefix: 'av_', event: 'block', variable: 'allow' },
  ],
}

const issue = checkEventName(policy, 'av_count')
```

- 结构校验：`validateStructure(doc)`；
- 严格序列化：`serializeChecked(doc)`（结构错误时抛 `DocumentStructureError`）；
- 引擎校验：`validateScxml` / `validateAgainstEngine` / `validateDocument`。

## Engine：会话驱动

```ts
import { SessionRunner } from 'statechart-kit/engine'

const runner = new SessionRunner({
  engine: 'sandboxed',   // 默认；用户可编辑图表必须用 sandboxed
  domParser,             // Node 环境必须注入
  data: restoredVars,    // 启动前覆盖 <data>
})

await runner.start(xml, { data: { count: 3 } })

runner.on((event) => {
  if (event.type === 'send') console.log(event.name, event.data)
  if (event.type === 'done') console.log(event.data)
  if (event.type === 'error') console.error(event.kind, event.message)
})

runner.send('start')
await runner.settled()
```

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `engine` | `sandboxed` | `trusted` 在宿主 JS realm 运行，**不是安全沙箱** |
| `scriptTimeoutMs` | 引擎 2000ms | 单次脚本/表达式求值上限；trusted 忽略 |
| `memoryLimitBytes` | 引擎 64MiB | QuickJS 会话内存上限；trusted 忽略 |
| `maxMicrosteps` | 100000 | 单宏步上限，超出触发 `error.platform` |
| `data` | 无 | 启动前覆盖 `<data>`，避免 entry 先跑 |

typed 事件契约见 [`docs/session-events.md`](docs/session-events.md)。

## Vue 编辑器

```ts
import { mountEditor } from 'statechart-kit/vue'
import 'statechart-kit/vue/style.css'

const mounted = mountEditor('#editor', {
  adapter: {
    load: () => fetchDraft(),
    save: (doc) => putDraft(doc),
    importProject: () => openFilePicker(),
    exportProject: (doc) => downloadJson(doc),
    exportScxml: (xml) => downloadXml(xml),
    externalEvents: () => service.eventSources,
    deploy: (doc) => service.deploy(doc),
    exit: () => router.back(),
    onDocChange: (doc) => schedulePreview(doc),
  },
  features: {
    deploy: true,
    exit: true,
    explorer: true,
  },
})

await mounted.ready
```

编辑器不读 localStorage、不发 HTTP；持久化、文件导入导出、外部事件、部署、退出全部
通过 `EditorAdapter` 注入。常用字段：

| Adapter 字段 | 用途 |
| --- | --- |
| `load` / `save` | 加载/自动保存草稿 |
| `importProject` / `exportProject` / `exportScxml` | 打开、保存、导出 SCXML |
| `externalEvents` | 时钟/路由/MQTT 等外部事件候选 |
| `runner` / `domParser` / `policy` | 引擎选项、Node 解析器、宿主命名策略 |
| `readOnly` | 草稿软锁/冲突 |
| `deploy` / `exit` | 宿主部署与退出 |
| `onDirtyChange` / `onDocChange` / `onLog` | 宿主状态同步 |
| `explorerStrings` | 官方 Explorer 文案覆盖 |

完整契约见 [`docs/editor.md`](docs/editor.md)。上层能力（全局变量、路由、MQTT、部署面板）
用 `EditorModule` 注入，见 [`docs/editor-modules.md`](docs/editor-modules.md)。

### Explorer

`features.explorer: true` 时：

- 编辑态使用未启动的预览 session，不执行 entry/exit、定时器或脚本；
- 仿真态跟随运行会话；
- 点击 Explorer 中的状态会同步选中编辑器状态并滚动结构树；
- 覆盖层内的转移列表可直接选中转移并打开属性面板。

默认关闭。

## 只读预览容器

[`preview/`](preview/README.md) 提供一个小型 Docker 容器，读取挂载目录里最新的
`.scxml` / `.json`，只读打开编辑器，支持仿真、校验和 Explorer。

```bash
docker build -f preview/Dockerfile -t statechart-preview .
docker run -d --name statechart-preview -p 5182:5182 \
  -v /opt/statechart-preview/data:/data:ro statechart-preview
```

## 诊断与本地化

core/engine 只返回 `{code, params}`，不返回中文文案。宿主可以：

- 用 `statechart-kit/diagnostics/zh` 直接格式化；
- 或按 `code` 接入自己的 i18n；
- 用 `issue.stateId` / `event` / `transitionId` / `actionIndex` 定位到编辑器控件。

完整 code 表见 [`docs/messages.md`](docs/messages.md)。

## 兼容性

- 版本 `0.10.0`，Node.js >= 20，ESM only；
- `vue` 是 optional peer；
- `ProjectDoc` / SCXML 输出在 0.10 线保持稳定；
- `TransitionEdge.target` 可为 `null`，`ListenEdge.target` / `EventOrigin.target` 同步可空；
- `features.explorer` 默认 `false`，不改变现有宿主行为。

## 文档

- [宿主集成指南](docs/host-integration.md)
- [Vue 编辑器](docs/editor.md)
- [EditorModule 契约](docs/editor-modules.md)
- [会话 typed 事件](docs/session-events.md)
- [诊断 code](docs/messages.md)
- [只读预览容器](preview/README.md)
- [更新日志](CHANGELOG.md)

维护者内部文档（阶段历史、架构复盘、需求记录、发布）在 [`docs/internal/`](docs/internal/)，
不作为公开集成入口。

## 开发

```bash
npm install
npm run typecheck
npm test
npm run build
npm run verify:all
```

Agent/自动化工具请先读 [`AGENTS.md`](AGENTS.md)。

## 版本与发布

- 语义化版本；0.x 期间 minor 可含破坏性变更，必须写入 `CHANGELOG.md`；
- 发布流程见 [`docs/internal/releasing.md`](docs/internal/releasing.md)；
- 发布前必须 `npm run verify:all`。

## License

MIT
