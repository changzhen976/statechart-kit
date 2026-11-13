# 宿主集成指南

本文面向把 `statechart-kit` 接入自己应用、服务或自动化平台的开发者。目标不是介绍内部实现，
而是回答：**我的宿主应该用哪个入口、需要实现什么、哪些事情不该由 kit 做。**

## 1. 先选集成方式

| 宿主场景 | 使用入口 | 宿主需要提供 |
| --- | --- | --- |
| 只生成、导入、校验 SCXML | `statechart-kit` | 文档存取、命名策略（可选） |
| 在服务端运行/回放状态图 | `statechart-kit` + `statechart-kit/engine` | Node 的 `domParser`、引擎选择、事件来源 |
| 嵌入 Vue 编辑器 | `statechart-kit/vue` | `EditorAdapter`、样式、可选 `EditorModule` |
| 只读查看最新图 | `preview/` 容器 | 挂载最新 `.scxml` / `.json` |
| Node-RED / 自动化平台 | 上面两者 | 流程存储、事件总线、认证、部署 |

一个宿主可以只用其中一层：

- 只使用 core：不安装 Vue，不加载引擎；
- 使用 engine：需要 `@tinyactors/scxmljs`（作为 kit 的运行时依赖安装）；
- 使用编辑器：额外需要 Vue 3.5+ 与浏览器 DOM；
- 使用预览容器：不需要在宿主中安装任何 kit 依赖。

## 2. 职责边界

| 能力 | kit 提供 | 宿主实现 |
| --- | --- | --- |
| 文档模型 | `ProjectDoc`、`StateNode`、`TransitionEdge` | 持久化格式/数据库 |
| SCXML | 序列化、导入、结构校验 | 部署、版本管理、运行时下发 |
| 命名 | `NamingPolicy` 契约与匹配 | 服务端/MQTT 前缀语义 |
| 事件 | 本地事件目录、激活树 | 时钟、路由、MQTT、外部来源抓取 |
| 会话 | `SessionRunner`、typed 事件 | 事件来源、日志落盘、告警 |
| 编辑器 | 编辑/画布/属性/仿真/校验 | 持久化、文件选择、部署、草稿锁 |
| 诊断 | `{code, params}` | 本地化文案、跳转/定位 UI |

**不要把持久化、认证、MQTT 连接或部署逻辑塞进 kit**。这些能力通过 adapter/module 注入，
kit 不应知道宿主的传输层和服务端模型。

## 3. Core：文档与 SCXML

```ts
import {
  emptyDoc,
  scxmlToDoc,
  serializeChecked,
  serializeToScxml,
  validateStructure,
} from 'statechart-kit'

const doc = emptyDoc('demo')
const report = validateStructure(doc)
if (!report.ok) throw new Error('invalid document')

const xml = serializeChecked(doc) // 结构错误时抛 DocumentStructureError
const imported = scxmlToDoc(xml)
```

推荐：

- 部署/运行路径使用 `serializeChecked`，不要用容忍式 `serializeToScxml`；
- 导入外部 SCXML 后先看 `warnings`，再决定是否允许保存/部署；
- 诊断只处理 `code + params`，中文展示可以接 `statechart-kit/diagnostics/zh` 或宿主 i18n。

## 4. Engine：会话驱动

```ts
import { SessionRunner } from 'statechart-kit/engine'

const runner = new SessionRunner({
  engine: 'sandboxed',
  domParser,              // Node 必须注入；浏览器可省略
  scriptTimeoutMs: 500,
  maxMicrosteps: 10_000,
  data: restoredVariables, // 启动前覆盖 <data>
})

await runner.start(xml, { data: { count: 3 } })

runner.on((event) => {
  switch (event.type) {
    case 'send':
      // event.name / event.data / event.target / event.sendid
      break
    case 'done':
      // event.data = 顶层 final 的 donedata
      // event.states = 进入终态的最后一批状态（至少含 final id）
      break
    case 'error':
      // event.stateId / transitionId / slot / actionIndex / element 可定位出错动作
      break
  }
})
```

### 引擎选择

- `sandboxed`：默认，QuickJS/WASM，适合用户可编辑或不可信图表；
- `trusted`：在宿主 JS realm 运行，**不是安全沙箱**，只用于完全可信的图表。

### Node 环境

Node 没有全局 `DOMParser`，必须传入。`@xmldom/xmldom` 与 happy-dom 都可；错误定位不依赖
`Element.closest()`，只使用 DOM Level 1 API。

```ts
import { Window } from 'happy-dom'
const domParser = new (new Window().DOMParser)()
```

### 生命周期

- `start()` 失败会抛异常，不额外发 typed `error`；
- `settled()` 等待当前宏步稳定；
- `stop()` 释放会话；
- 并发 `start` / 加载中 `stop` 已做保护，但宿主仍应避免重复点击。

## 5. Vue 编辑器：最小接入

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
  },
  features: {
    deploy: true,
    exit: true,
    explorer: true,
  },
})

await mounted.ready
```

英文宿主可用 `locale: 'en'` 和 `diagnostics` 覆盖诊断文案：

```ts
mountEditor('#editor', {
  locale: 'en',
  diagnostics: { formatValidationIssue: myEnglishFormatter },
  adapter,
})
```

编辑器挂载后：

```ts
mounted.editor.doc           // 当前 ProjectDoc
mounted.editor.select(...)   // 选中状态/转移
mounted.editor.validate()    // 校验
mounted.editor.run()         // 仿真
mounted.editor.undo()        // 撤销
mounted.unmount()            // 卸载并清理
```

### EditorAdapter

| 方法/字段 | 缺失时 | 说明 |
| --- | --- | --- |
| `load()` | 空文档 | 读取草稿/服务端文档 |
| `save(doc)` | 不自动保存 | 防抖后的自动保存 |
| `importProject()` | “打开”提示 | 文件选择/服务端草稿 |
| `exportProject(doc)` | 仅 `save()` | 手动保存/下载 |
| `exportScxml(xml, doc)` | 浏览器下载 | 导出标准 SCXML |
| `examples` | 内置示例 | 宿主示例列表 |
| `externalEvents()` | 只显示文档内事件 | 时钟/路由/MQTT 入向 |
| `runner` / `domParser` / `policy` | 默认值 | 引擎选项、Node 解析器、命名策略 |
| `readOnly` | false | 草稿锁/冲突 |
| `deploy(doc)` / `exit(doc)` | 按钮不显示 | 宿主部署/退出 |
| `onDirtyChange` / `onDocChange` / `onLog` | 不通知 | 宿主同步状态 |
| `explorerStrings` | 官方文案 | Explorer 文案覆盖 |

完整契约见 [`editor.md`](editor.md)。

### 能力开关

`features` 可以按场景裁剪：toolbar / structure / canvas / properties / variables /
events / simulation / simBar / validation / importExport / examples / undoRedo /
deploy / exit / explorer。默认全开，deploy/exit/explorer 默认关闭或按需打开。

### EditorModule

全局变量、事件路由、MQTT、部署面板等上层能力通过 `EditorModule` 注入：

```ts
mountEditor('#editor', {
  adapter,
  modules: [globalsModule, routesModule, mqttModule],
})
```

模块可以贡献右侧标签页、工具栏命令、外部事件来源、额外校验、变量/事件属性字段。
详见 [`editor-modules.md`](editor-modules.md)。

### 生命周期

- `mountEditor()` 立即挂载；`await mounted.ready` 等 adapter 初始化完成；
- `onDocChange` 在每次文档变化后调用；宿主可做预览、同步或脏检查；
- `onDirtyChange` 适合 beforeunload/离开守卫；
- `unmount()` 会调用 `editor.destroy()`，模块的 dispose 回调按逆序执行。

### SSR

编辑器依赖 DOM 与 `<scxml-view>` 自定义元素，只能在浏览器运行。SSR 宿主请：

- 只在客户端动态 import `statechart-kit/vue`；
- 样式通过 `statechart-kit/vue/style.css` 显式加载。

## 6. Explorer

`features.explorer: true` 时：

- 编辑态使用未 `start()` 的预览 session，不执行 entry/exit、定时器或脚本；
- 仿真态跟随运行中的会话；
- 点击 Explorer 状态会同步选中编辑器状态并滚动结构树；
- 覆盖层的转移列表可以直接选中转移并打开属性面板；
- 官方 Explorer 是只读检查器，不能在 Explorer 内修改文档。

## 7. 推荐集成模式

### 模式 A：宿主自己持久化

- `load/save` 接数据库或服务端 API；
- `importProject/exportProject` 接文件选择/下载；
- kit 不关心存储位置和格式。

### 模式 B：宿主注入外部事件

- `externalEvents()` 返回时钟/路由/MQTT 候选；
- 实际事件发送由宿主服务完成；
- 编辑器只负责展示/筛选候选。

### 模式 C：宿主控制部署

- `deploy(doc)` 中先 `serializeChecked(doc)` 或 `validateDocument`；
- 再把 SCXML 下发给运行时/设备；
- `canDeploy()` 可按草稿锁/权限决定按钮状态。

## 8. 安全

- 用户可编辑/可上传的图表必须使用 `engine: 'sandboxed'`；
- `trusted` 只用于完全可信的图表；
- preview 容器无认证，仅限内网/Tailscale；
- 编辑器不读 localStorage、不发 HTTP，宿主仍需校验导入内容。

## 9. 测试建议

| 层 | 建议 |
| --- | --- |
| 宿主 adapter | mock `load/save/importProject` 的契约测试 |
| 文档/序列化 | 用 `serializeChecked` + `validateStructure` 做 round-trip |
| 会话 | 用 `SessionRunner` 跑关键事件序列，断言 active/vars/done |
| 编辑器 | 在浏览器或 `happy-dom` 挂载 `statechart-kit/vue` |

## 10. 升级注意

- `TransitionEdge.target` 可为 `null`，事件目录的 target 也可空；
- 从 0.8.x 升级时先处理 null target，再接 0.9+ 的 doneData；
- Vue 是 optional peer，升级前确认宿主的 Vue 版本满足 `^3.5`；
- 公开 API/诊断 code 变化看 [`CHANGELOG.md`](../CHANGELOG.md)。
