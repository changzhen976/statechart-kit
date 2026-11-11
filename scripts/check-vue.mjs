/**
 * Vue 编辑器发布物冒烟：在 happy-dom 里真实挂载 dist/vue.js。
 *
 * 只验证构建产物可加载、EditorHost 可挂载/卸载、adapter 可注入；不启动 scxml-view
 * 会话（画布在真实浏览器里由宿主验证）。
 */
import { Window } from 'happy-dom'

const window = new Window({ url: 'http://localhost/' })
const globals = {
  window,
  document: window.document,
  navigator: window.navigator,
  localStorage: window.localStorage,
  HTMLElement: window.HTMLElement,
  SVGElement: window.SVGElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  customElements: window.customElements,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  ResizeObserver: window.ResizeObserver,
  MutationObserver: window.MutationObserver,
}
for (const [key, value] of Object.entries(globals)) {
  if (value === undefined) continue
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  } catch {
    /* Node 已有只读全局（如 navigator）时跳过 */
  }
}

const { mountEditor } = await import('../dist/vue.js')
const host = document.createElement('div')
document.body.append(host)

const mounted = mountEditor(host, {
  features: {
    canvas: false,
    simulation: false,
    simBar: false,
    validation: false,
    examples: false,
  },
  autoLoad: false,
  adapter: { load: () => null, save: () => {} },
  modules: [
    {
      id: 'probe.module',
      setup(ctx) {
        ctx.tabs.add({ id: 'probe-tab', title: 'ProbeTab', component: { render: () => null } })
        ctx.toolbar.add({ id: 'probe-cmd', label: 'ProbeCmd', run: () => {} })
        ctx.variableFields.add({
          id: 'probe.var.global',
          key: 'global',
          label: 'ProbeGlobal',
          type: 'boolean',
        })
        ctx.eventFields.add({
          id: 'probe.event.broadcast',
          key: 'broadcast',
          label: 'ProbeBroadcast',
          type: 'boolean',
        })
      },
    },
  ],
})
await mounted.ready
if (!host.querySelector('.sce-root')) throw new Error('EditorHost 未渲染 .sce-root')
if (!mounted.editor.doc || mounted.editor.doc.formatVersion !== 1) {
  throw new Error('editor.doc 未初始化')
}
if (!host.textContent.includes('ProbeTab') || !host.textContent.includes('ProbeCmd')) {
  throw new Error('模块标签页/工具栏未渲染')
}
mounted.editor.addVariable()
mounted.editor.setEventAttr('probe.event', 'broadcast', true)
await new Promise((r) => setTimeout(r, 20))
const tabTexts = [...host.querySelectorAll('.sce-tabs button')].map((b) => b.textContent.trim())
if (!tabTexts.includes('事件')) throw new Error(`事件标签页未渲染：${tabTexts.join(',')}`)
if (!host.textContent.includes('ProbeGlobal') || !host.textContent.includes('ProbeBroadcast')) {
  throw new Error('变量/事件字段未渲染')
}
mounted.unmount()
console.log('vue ok: dist/vue.js mounts EditorHost and unmounts')
