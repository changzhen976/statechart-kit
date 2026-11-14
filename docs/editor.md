# Vue 编辑器集成

`statechart-kit/vue` 是一个可嵌入的 Vue 3 状态图编辑器：结构树、画布、属性、变量、
事件、仿真、校验、撤销和 Explorer。它不负责宿主的持久化、认证、部署或事件传输。

## 入口

### 命令式挂载

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
  features: { deploy: true, exit: true, explorer: true },
})

await mounted.ready
mounted.editor.doc
mounted.unmount()
```

### Vue 应用内

```ts
import { createEditor, EditorHost } from 'statechart-kit/vue'

const editor = createEditor({ adapter })
await editor.ready
// <EditorHost :editor="editor" />
```

`mountEditor` 返回 `{ app, editor, ready, unmount }`；`createEditor` 返回 `EditorStore`，
适合宿主自己控制 `<EditorHost>` 的挂载位置和生命周期。

## 分层

```text
statechart-kit/vue
  index.ts            mountEditor / createEditor / 公开导出
  EditorHost.vue      Toolbar / Structure / Canvas / right tabs / SimBar / dialogs
  editor-store.ts     reactive store：CRUD、undo、保存、校验、仿真、确认
  types.ts            EditorAdapter（宿主能力注入）
  modules.ts          EditorModule 契约
  features.ts         EditorFeatures 能力开关
  browser-adapter.ts  浏览器默认 adapter
  format.ts           诊断 code → 中文展示
  events.ts           事件候选（展示层）
  labels.ts           默认中文 + DEFAULT_LABELS_EN
  styles.css          全部编辑器样式
  DoneDataEditor.vue  doneData 的 content/expr/param 编辑器
  canvas-select.ts    画布标签 → 转移匹配（纯函数）
  canvas-fit.ts       大画布扩容与 fit 比例纯函数
```

原则：

- 编辑器不读 localStorage、不发 HTTP；
- 持久化、文件导入导出、外部事件、部署、退出全部走 `EditorAdapter`；
- 不引入 Pinia；使用 `reactive` store + `provide/inject`；
- 组件不写 scoped style，样式统一在 `src/vue/styles.css`；
- 上层能力通过 `EditorModule` 注入，不进入 kit 内部。

## `features` 开关

| 开关 | 内容 |
| --- | --- |
| `toolbar` | 顶部工具栏 |
| `structure` | 左栏状态树、转移列表、新建表单 |
| `canvas` | 中间 `<scxml-view>` |
| `properties` / `variables` / `events` / `simulation` | 右侧标签页 |
| `simBar` | 底部播放/暂停/单步/速度/停止 |
| `validation` | 校验按钮与弹窗 |
| `importExport` | 新建/打开/保存/导出 |
| `examples` | 示例下拉 |
| `undoRedo` | 撤销/重做 |
| `deploy` / `exit` | 宿主部署/退出 |
| `explorer` | 官方 `<scxml-explorer>` 覆盖层 |
| `resizablePanes` | 左右栏可拖拽调宽/折叠 |

`deploy` / `exit` / `explorer` / `resizablePanes` 默认关闭；其余默认开启。宿主可以只打开表单 + 画布，
也可以全开并接部署/退出。

## 结构树与画布

### 结构树折叠

- `compound` / `parallel` 行首有 caret；默认全部展开；
- 折叠状态只保存在当前编辑器会话内，不写入 `ProjectDoc`；
- 过滤时强制展开命中路径，清空过滤后恢复之前的折叠；
- 画布选中被折叠隐藏的后代时，自动展开祖先并滚动到对应行；
- `atomic` / `final` / `history` 不显示 caret。

自定义 JS 的提示：点击「校验」会显示「草稿包含自定义 JS」弹窗；点击「运行」只在日志中
记录检测到的脚本数量，不再用模态框挡住仿真画布。

### 可调宽侧栏

`features.resizablePanes: true` 时左右栏可拖拽调宽、双击复位、折叠。折叠按钮位于
分割线纵向中点，不随左栏滚动，`aria-expanded` 会同步状态。

### 画布方向与 fit

- 画布使用固定大画布承载官方 view，内容超过当前画布时自动扩容（上限 20000px）；
- 切换「横向 / 纵向 / 自动」时等待官方布局完成后 fit 一次；
- 侧栏调宽/窗口 resize 不强制重置用户缩放；
- fit 最低 0.1；普通滚轮平移、Ctrl+滚轮缩放、左键拖拽平移仍由外层承担。

## 本地化与诊断

默认中文。英文宿主可以：

```ts
import { DEFAULT_LABELS_EN, mountEditor } from 'statechart-kit/vue'

mountEditor('#editor', {
  locale: 'en',
  labels: { appTitle: 'Workflow Editor' }, // 少量宿主专有文案
  diagnostics: {
    formatValidationIssue: (issue) => myEnglishFormatter(issue),
  },
})
```

- `locale: 'en'` 使用 `DEFAULT_LABELS_EN`；`labels` 仍可覆盖单个键；
- `diagnostics` 支持 `formatNamingIssue` / `formatStructureIssue` / `formatValidationIssue` /
  `formatImportWarning` / `formatVariableResult`，未提供的项回退中文；
- `DEFAULT_LABELS_EN` 可单独 import，用于 SSR 或宿主自己的标签组合。

诊断 code 的稳定目录从 core 导出：

```ts
import {
  STRUCTURE_ISSUE_CODES,
  IMPORT_WARNING_CODES,
  VALIDATION_ISSUE_CODES,
} from 'statechart-kit'
```

## 事件可见性

事件面板的「接收事件」现在显示真实来源和可见性；`raise` 动作还会出现在「内部发出」区块：

```text
内部发出
事件             来源                         监听
internal.ping    left · 进入动作              1 条转移
```

接收事件：

| 列 | 内容 |
| --- | --- |
| 来源 | `内部 raise` / `本机 send` / `自动延时` / `外部来源` / `仅监听` |
| 可见性 | `双向`（默认）/ `仅内部` |

设置为「仅内部」后，序列化器会给该事件的所有转移加标准 SCXML 守卫：

```xml
<transition
  event="parallel.go"
  data-kit-visibility="internal"
  cond="_event.type === 'internal'"
  target="next"
/>
```

- 内部事件用 `raise <event>` 动作产生，动作编辑器提供「内部事件 raise」；
- 外部注入同名事件会被守卫拦截；
- 编辑器仿真面板也会拒绝 external 注入 internal-only 事件；
- 自动延时事件不参与该守卫：引擎里 `<send delay>` 的 `_event.type` 是 `external`；
- 一条转移包含多个事件时，只有全部事件都是「仅内部」才加守卫，否则产生
  `structure.transition.mixed-event-visibility` warning；
- `ProjectDoc.eventVisibility` 是可选字段，缺省全部为双向。

`raise` 动作的 DSL：

```text
raise parallel.go
```

对应：

```xml
<raise event="parallel.go"/>
```

## `EditorAdapter` 契约

| 方法/字段 | 缺失时行为 |
| --- | --- |
| `load()` | 空文档 |
| `save(doc)` | 不自动保存 |
| `importProject()` | “打开”提示宿主未提供 |
| `exportProject(doc)` | 保存仅 `save()` |
| `exportScxml(xml, doc)` | 浏览器 Blob 下载 |
| `examples` | 使用 core `EXAMPLES`；传 `[]` 禁用 |
| `externalEvents()` | 事件下拉只含文档内事件 |
| `runner` / `domParser` | 引擎默认 sandboxed；Node 需注入 `domParser` |
| `policy` | 默认 `BASE_POLICY`；宿主应传入自己的 `NamingPolicy` |
| `readOnly` | 可编辑 |
| `deploy(doc)` / `exit(doc)` | 对应按钮不显示/无效 |
| `onDirtyChange` / `onDocChange` / `onLog` | 不通知 |
| `explorerStrings` | 使用官方 Explorer 默认英文文案 |

`onDocChange` 会被编辑器内部的每次有效编辑触发；宿主可以做防抖预览、同步或脏检查。
不要把 Vue reactive Proxy 直接 `postMessage`/`structuredClone`，先 JSON 克隆。

## Explorer

`features.explorer: true` 时：

- 编辑态：创建一个**未 start** 的预览 session 并 attach，不执行 entry/exit、定时器或脚本；
- 仿真态：attach `SessionRunner` 的运行中会话；
- 文档变化后 debounce 重建预览 session；
- 点击 Explorer 状态会 `editor.select('state', uid)` 并滚动结构树；
- 覆盖层中的转移列表直接 `editor.select('transition', id)`；
- 关闭 Explorer / 切换仿真 / 卸载时 detach 并 dispose 预览 session。

官方 `<scxml-explorer>` 是只读检查器；真正的编辑仍在属性/结构面板完成。

## 构建与发布

- `tsup`：core / engine / diagnostics；
- `vite build`：`src/vue/index.ts` → `dist/vue.js`（`vue`、`@tinyactors/*` external）；
- `vue-tsc -p tsconfig.vue-dts.json` → `dist/vue-types/**`；
- `scripts/copy-vue-assets.mjs` → `dist/vue/style.css`；
- `scripts/check-vue.mjs`：happy-dom 挂载 `dist/vue.js`，含 Explorer 回归；
- `check:pack`：确认 `dist/vue.js`、`dist/vue/style.css`、Vue 类型入口都在 tarball 中。

`vue` 是 optional peer；只用 core/engine 的宿主不需要安装 Vue。编辑器依赖 DOM 与
`<scxml-view>` / `<scxml-explorer>` 自定义元素，仅浏览器运行；SSR 请客户端动态 import。

## 安全与限制

- 编辑器不提供认证/权限；`readOnly` 只是 UI 锁；
- `trusted` 引擎不是安全沙箱；用户可编辑图表必须 `sandboxed`；
- 预览 session 不启动，不执行动作；但这不替代宿主对导入内容的校验；
- 官方 Explorer 的 DOM 契约可能随上游变化，升级 `@tinyactors/scxmljs` 后跑 `check:vue`。
