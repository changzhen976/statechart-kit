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
  EventTarget: window.EventTarget,
  CustomEvent: window.CustomEvent,
  CSSStyleSheet: window.CSSStyleSheet,
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
    resizablePanes: true,
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
mounted.editor.addState('atomic')
const probeUid = mounted.editor.selection.id
if (!probeUid) throw new Error('probe state not selected')
mounted.editor.updateState(probeUid, { entryActions: ['send probe.event'] })
mounted.editor.setEventAttr('probe.event', 'broadcast', true)
await new Promise((r) => setTimeout(r, 20))
const tabTexts = [...host.querySelectorAll('.sce-tabs button')].map((b) => b.textContent.trim())
if (!tabTexts.includes('事件')) throw new Error(`事件标签页未渲染：${tabTexts.join(',')}`)
if (!host.textContent.includes('ProbeGlobal') || !host.textContent.includes('ProbeBroadcast')) {
  throw new Error('变量/事件字段未渲染')
}
const leftToggle = host.querySelector('.sce-side-left .sce-pane-toggle')
if (!leftToggle) throw new Error('可调宽侧栏的折叠按钮未渲染')
leftToggle.click()
await new Promise((r) => setTimeout(r, 20))
if (!host.querySelector('.sce-side-left.collapsed')) throw new Error('左侧栏折叠未生效')
leftToggle.click()
await new Promise((r) => setTimeout(r, 20))
if (host.querySelector('.sce-side-left.collapsed')) throw new Error('左侧栏展开未生效')
mounted.unmount()

// Explorer：编辑态预览 session + 状态/转移选中桥接。官方 explorer 依赖
// EventTarget/CSSStyleSheet，happy-dom 已提供；真实布局仍由浏览器验证。
const explorerHost = document.createElement('div')
document.body.append(explorerHost)
const explorerDoc = {
  formatVersion: 1,
  name: 'explorer-probe',
  initial: 's1',
  datamodel: [],
  layout: {},
  states: [
    { uid: 's1', id: 'a', label: 'a', kind: 'atomic', parent: null, initial: null, entryActions: [], exitActions: [] },
    { uid: 's2', id: 'b', label: 'b', kind: 'atomic', parent: null, initial: null, entryActions: [], exitActions: [] },
  ],
  transitions: [
    { id: 't1', source: 's1', target: 's2', event: 'go', cond: 'x > 0', actions: [] },
  ],
}
const explorerMounted = mountEditor(explorerHost, {
  initialDoc: explorerDoc,
  features: {
    canvas: true,
    explorer: true,
    simulation: false,
    simBar: false,
    validation: false,
    examples: false,
  },
  autoLoad: false,
  adapter: { load: () => null, save: () => {}, domParser: new window.DOMParser() },
})
await explorerMounted.ready
const explorerButton = [...explorerHost.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Explorer')
if (!explorerButton) throw new Error('Explorer 按钮未渲染')
explorerButton.click()
await new Promise((r) => setTimeout(r, 900))
const explorerEl = explorerHost.querySelector('scxml-explorer')
if (!explorerEl || !explorerEl.shadowRoot) throw new Error('Explorer 未升级/挂载')
explorerEl.dispatchEvent(
  new window.CustomEvent('scxml-select', {
    detail: { state: { id: 'a' } },
    bubbles: true,
    composed: true,
  }),
)
await new Promise((r) => setTimeout(r, 80))
if (explorerMounted.editor.selection.kind !== 'state' || explorerMounted.editor.selection.id !== 's1') {
  throw new Error(`Explorer 状态选中未同步：${JSON.stringify(explorerMounted.editor.selection)}`)
}
const transitionRow = explorerHost.querySelector('.explorer-transition')
if (!transitionRow) throw new Error('Explorer 转移列表未渲染')
transitionRow.click()
await new Promise((r) => setTimeout(r, 50))
if (explorerMounted.editor.selection.kind !== 'transition' || explorerMounted.editor.selection.id !== 't1') {
  throw new Error(`Explorer 转移选中未同步：${JSON.stringify(explorerMounted.editor.selection)}`)
}
explorerMounted.unmount()
console.log('vue ok: EditorHost mounts; Explorer edit preview and selection bridge work')
