/**
 * statechart-kit/vue — 可嵌入的 Vue 3 状态图编辑器（P3）。
 *
 * 用法一（命令式，适合宿主自己的页面/iframe）：
 *
 *   import { mountEditor } from 'statechart-kit/vue'
 *   import 'statechart-kit/vue/style.css'
 *   const mounted = mountEditor('#editor', { adapter, features })
 *   await mounted.ready
 *
 * 用法二（Vue 应用内）：
 *
 *   import { createEditor, EditorHost } from 'statechart-kit/vue'
 *   const editor = createEditor({ adapter })
 *   <EditorHost :editor="editor" />
 *
 * 编辑器不读 localStorage、不发 HTTP：持久化/导入导出/外部事件/部署/退出都通过
 * `EditorAdapter` 注入。浏览器默认适配器见 `createBrowserAdapter`。
 */
import './styles.css'
import { createApp, type App } from 'vue'
import EditorHost from './EditorHost.vue'
import { createEditor, type CreateEditorOptions, type EditorStore } from './editor-store'
import { EDITOR_KEY } from './use-editor'

export { EditorHost }
export { createEditor, type CreateEditorOptions, type EditorStore }
export { EDITOR_KEY, useEditor } from './use-editor'
export { DEFAULT_FEATURES, resolveFeatures, type EditorFeatures } from './features'
export { DEFAULT_LABELS, type EditorLabels } from './labels'
export { createBrowserAdapter, type BrowserAdapterOptions } from './browser-adapter'
export type {
  EditorAdapter,
  EditorExample,
  EditorImportResult,
} from './types'
export type { EditorEventOption, EditorEventGroup } from './events'
export type {
  EditorEventSourceProvider,
  EditorEventSourceRegistry,
  EditorModule,
  EditorModuleContext,
  EditorModuleIssue,
  EditorTabContribution,
  EditorTabRegistry,
  EditorToolbarContribution,
  EditorToolbarRegistry,
  EditorValidationContext,
  EditorValidator,
  EditorValidatorRegistry,
} from './modules'
export {
  formatImportWarning,
  formatNamingIssue,
  formatStructureIssue,
  formatValidationIssue,
  formatVariableResult,
} from './format'

export interface MountedEditor {
  app: App
  editor: EditorStore
  /** 初始化（读取 adapter.load / 外部事件）完成 */
  ready: Promise<void>
  unmount(): void
}

/** 把编辑器挂到 DOM 元素/选择器；返回 app、editor 与卸载函数。 */
export function mountEditor(
  target: string | Element,
  options: CreateEditorOptions = {},
): MountedEditor {
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (!el) throw new Error(`mountEditor: 找不到挂载目标 ${String(target)}`)
  const editor = createEditor(options)
  const app = createApp(EditorHost, { editor })
  app.provide(EDITOR_KEY, editor)
  app.mount(el)
  return {
    app,
    editor,
    ready: editor.ready,
    unmount(): void {
      app.unmount()
      void editor.destroy()
    },
  }
}
