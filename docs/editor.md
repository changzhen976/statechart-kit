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
  labels.ts           默认中文文案
  styles.css          全部编辑器样式
  DoneDataEditor.vue  doneData 的 content/expr/param 编辑器
  canvas-select.ts    画布标签 → 转移匹配（纯函数）
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

`deploy` / `exit` / `explorer` 默认关闭；其余默认开启。宿主可以只打开表单 + 画布，
也可以全开并接部署/退出。

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
