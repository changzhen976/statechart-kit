# P3：Vue 编辑器抽离

- 日期：2026-11-10
- 目标：把 `scxml-creator` 的编辑器 UI 从宿主应用中抽出，作为 `statechart-kit/vue` 可嵌入组件
- 结论：编辑器壳、store、adapter、功能开关、样式与构建链已落地；画布的官方 shadow DOM
  高级交互（点击选中/缩放平移/Explorer）与宿主服务绑定留在 P4 迁移清单

## 1. 入口与用法

### 命令式挂载

```ts
import { mountEditor } from 'statechart-kit/vue'
import 'statechart-kit/vue/style.css'

const mounted = mountEditor('#editor', {
  adapter: {
    load: () => fetchDraft(),              // 服务端草稿 / localStorage
    save: (doc) => putDraft(doc),          // 自动保存
    importProject: () => openFilePicker(), // 打开 JSON / SCXML
    exportProject: (doc) => download(doc),
    exportScxml: (xml, doc) => download(xml),
    externalEvents: () => service.extEventSources,
    deploy: (doc) => service.deployDraft(doc),
    exit: () => router.back(),
  },
  features: { deploy: true, exit: true },
})

await mounted.ready
// mounted.editor 可直接操作文档/选中/仿真
mounted.unmount()
```

### Vue 应用内

```ts
import { createEditor, EditorHost } from 'statechart-kit/vue'

const editor = createEditor({ adapter, features })
await editor.ready
// <EditorHost :editor="editor" />
```

## 2. 分层

```
statechart-kit/vue
  index.ts            mountEditor / 公开导出
  EditorHost.vue      布局：Toolbar / Structure / Canvas / right tabs / SimBar / dialogs
  editor-store.ts     reactive store：文档 CRUD、undo、保存、校验、仿真、确认
  features.ts         能力开关（toolbar/structure/canvas/...）
  types.ts            EditorAdapter（宿主能力）与 EditorFeatures
  browser-adapter.ts  浏览器默认实现：localStorage + 文件导入导出 + 内置示例
  format.ts           诊断 code → 中文展示文本（宿主可替换）
  events.ts           事件目录 + 外部来源 → 下拉候选
  labels.ts           默认中文文案（可整体/按键覆盖）
  styles.css          tokens + 全部编辑器样式（显式 import）
```

原则：

- **编辑器不读 localStorage、不发 HTTP**：默认适配器只是浏览器默认值，宿主可全量覆盖。
- **不依赖 Pinia**：一个 `reactive` store + `provide/inject`，避免把应用状态框架带进宿主。
- **core/engine 仍复用**：文档模型、序列化、命名策略、结构/引擎校验、SessionRunner 全部来自
  kit 已有入口；Vue 层只做展示与宿主适配。
- **样式集中**：组件不写 scoped style，统一 `src/vue/styles.css`；构建复制为
  `dist/vue/style.css`，宿主显式 import，避免 CSS 注入时序问题。

## 3. `features` 开关

| 开关 | 内容 |
| --- | --- |
| `toolbar` | 顶部工具栏 |
| `structure` | 左栏状态树 + 转移列表 + 新建表单 |
| `canvas` | 中间 `<scxml-view>` |
| `properties` / `variables` / `simulation` | 右栏三个标签页 |
| `simBar` | 底部播放/暂停/单步/速度/停止 |
| `validation` | 校验按钮/弹窗 |
| `importExport` | 新建/打开/保存/导出 |
| `examples` | 内置/宿主示例下拉 |
| `undoRedo` | 撤销/重做 |
| `deploy` / `exit` | 宿主部署/退出按钮（需 adapter 提供回调） |

默认全开（deploy/exit 关）。Node-RED 可只开表单 + 画布；scxml-creator 可全开并接部署/退出。

## 4. `EditorAdapter` 契约

| 方法 | 缺失时行为 |
| --- | --- |
| `load()` | 空文档 |
| `save(doc)` | 不自动保存（手动导出仍可用） |
| `importProject()` | “打开”提示宿主未提供 |
| `exportProject(doc)` | 保存仅 `save()` |
| `exportScxml(xml, doc)` | 浏览器 Blob 下载 |
| `examples` | 使用 core `EXAMPLES`；传 `[]` 禁用 |
| `externalEvents()` | 事件下拉只含文档内事件 |
| `runner` / `domParser` | 引擎默认 sandboxed；Node 需注入 domParser |
| `policy` | 默认 `BASE_POLICY`；宿主应传入组合后的 `NamingPolicy`（P4 起服务端策略在宿主） |
| `readOnly` | 可编辑 |
| `deploy(doc)` / `exit(doc)` | 对应按钮不显示/无效 |
| `onDirtyChange` / `onDocChange` / `onLog` | 不通知 |

## 5. 构建与发布

- `tsup`：core / engine / policies（ESM + d.ts，保持 P0–P2 不变）
- `vite build`：`src/vue/index.ts` → `dist/vue.js`（`vue`、`@tinyactors/*` external）
- `vue-tsc -p tsconfig.vue-dts.json`：生成 `dist/vue-types/**`，`exports["./vue"].types`
  指向 `dist/vue-types/vue/index.d.ts`
- `scripts/copy-vue-assets.mjs`：复制 `styles.css` → `dist/vue/style.css`
- `scripts/check-vue.mjs`：happy-dom 中真实挂载 `dist/vue.js`，验证 EditorHost 可渲染/卸载
- `check:pack`：断言 `dist/vue.js`、`dist/vue/style.css`、Vue 类型入口都在 tarball 中

`vue` 是 **optional peerDependency**：只用 core/engine 的宿主不会被迫安装 Vue。
编辑器依赖 DOM / 自定义元素，**仅浏览器运行**；SSR 请在客户端动态 import。

## 6. 上层功能模块

P4 引入 [`EditorModule`](editor-modules.md)：全局变量/事件路由/MQTT/部署以模块注入，
不进入 kit。编辑器本身保持宿主无关。

## 7. 有意保留到 P4 的能力

以下功能依赖 `scxml-creator` 的服务端 store / 官方 shadow DOM 细节，P3 不做“半套”复制：

1. 画布点击选中转移（`ChartViewHost` 的 composedPath/edge-label 契约）与缩放/平移层；
2. Explorer 逐层调试视图；
3. 结构化动作编辑器（P3 用 textarea，每行一条 DSL）；
4. 服务端机器绑定、草稿锁/冲突横幅、部署前守卫；
5. 全局变量/MQTT 出向/路由出向的 tip 文案（P3 事件下拉只展示本地 + adapter 外部来源 tag）。

P4 的迁移顺序建议：先切 store/校验/仿真（已就绪），再把 `ChartViewHost` 的高级交互作为
可选 `canvasEnhancer` 注入，最后搬服务绑定 UI。

## 8. 验收

- `npm run typecheck`：tsc + vue-tsc
- `npm test`：8 套件；`verify-editor` 25 条断言
- `npm run check:vue`：构建产物真实挂载
- `npm run check:pack`：三入口 + Vue 资源/类型
