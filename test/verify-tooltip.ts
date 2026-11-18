/**
 * KIT-017 转移标签 tooltip 验证：
 *   A. LabelFacts：结构化属性优先 + 旧 title/part 回退
 *   B. transitionForFacts：精确 id / 完整 cond / 截断前缀
 *   C. placeTooltip：翻转、夹边
 *   D. controller：hover/focus/touch、title 归属、同树 aria、可聚焦性、清理
 *
 * 运行：npm run test:tooltip
 */
import { Window } from 'happy-dom'
import type { ProjectDoc, StateNode, TransitionEdge } from '../src/core/model'

const window = new Window({ url: 'http://localhost/' })
const globals: Record<string, unknown> = {
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  PointerEvent: window.PointerEvent,
  FocusEvent: window.FocusEvent,
  KeyboardEvent: window.KeyboardEvent,
  MutationObserver: window.MutationObserver,
  CSSStyleSheet: window.CSSStyleSheet,
  ShadowRoot: window.ShadowRoot,
  ResizeObserver: window.ResizeObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: (fn: (time: number) => void) => setTimeout(() => fn(Date.now()), 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
}
for (const [key, value] of Object.entries(globals)) {
  if (value === undefined) continue
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  } catch {
    /* Node 已有只读全局时跳过 */
  }
}

const {
  createLabelTooltip,
  placeTooltip,
} = await import('../src/vue/label-tooltip')
const { labelFacts, transitionForFacts } = await import('../src/vue/canvas-contract')
const { matchTransitionId } = await import('../src/vue/canvas-select')
const { emptyDoc } = await import('../src/core/model')

let pass = 0
let fail = 0
function assert(cond: unknown, msg: string): void {
  if (cond) {
    pass++
    console.log('  OK', msg)
  } else {
    fail++
    console.error('  FAIL:', msg)
  }
}

const tick = (ms = 20): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function state(uid: string, id: string): StateNode {
  return {
    uid,
    id,
    label: id,
    kind: 'atomic',
    parent: null,
    initial: null,
    entryActions: [],
    exitActions: [],
  }
}

const LONG = 'temp > 80 && door === true && mode === "auto" && battery > 20 && !fault'

function makeDoc(): ProjectDoc {
  const doc = emptyDoc('tooltip-test')
  doc.states = [state('s1', 'idle'), state('s2', 'run')]
  doc.initial = 's1'
  doc.transitions = [
    {
      id: 't-long',
      source: 's1',
      target: 's2',
      event: 'go',
      cond: LONG,
      actions: [],
    },
    {
      id: 't-short',
      source: 's1',
      target: 's2',
      event: 'other',
      cond: 'x && y',
      actions: [],
    },
    {
      id: 't-prefix',
      source: 's1',
      target: 's2',
      event: 'go',
      cond: 'x && y',
      actions: [],
    },
    {
      id: 't-alt',
      source: 's1',
      target: 's2',
      event: 'go',
      cond: 'x && z',
      actions: [],
    },
    {
      id: 't-internal',
      source: 's1',
      target: null,
      event: '',
      cond: 'ready',
      actions: [],
    },
  ]
  return doc
}

interface FakeLabelOptions {
  event?: string
  condText?: string
  title?: string
  data?: {
    transitionId?: string
    cond?: string
    event?: string
    target?: string
  }
}

function fakeLabel(root: ShadowRoot, opts: FakeLabelOptions = {}): HTMLElement {
  const label = document.createElement('span')
  label.setAttribute('part', 'transition edge-label')
  const event = document.createElement('span')
  event.setAttribute('part', 'event')
  event.textContent = opts.event ?? 'go'
  const cond = document.createElement('span')
  cond.setAttribute('part', 'cond')
  cond.textContent = opts.condText ?? `[${LONG.slice(0, 21)}…]`
  label.append(event, cond)
  label.setAttribute('title', opts.title ?? `go [${LONG}] → run`)
  if (opts.data) {
    if (opts.data.transitionId !== undefined) label.setAttribute('data-transition-id', opts.data.transitionId)
    if (opts.data.cond !== undefined) label.setAttribute('data-cond', opts.data.cond)
    if (opts.data.event !== undefined) label.setAttribute('data-event', opts.data.event)
    if (opts.data.target !== undefined) label.setAttribute('data-target', opts.data.target)
  }
  root.append(label)
  return label
}

function makeView(): { view: HTMLElement; root: ShadowRoot } {
  const view = document.createElement('div')
  document.body.append(view)
  const root = view.attachShadow({ mode: 'open' })
  return { view, root }
}

function pointer(target: EventTarget, type: string, init: Record<string, unknown> = {}): any {
  const event = new window.PointerEvent(type, { bubbles: true, composed: true, ...init } as any)
  target.dispatchEvent(event as any)
  return event
}

// A. LabelFacts / transitionForFacts
{
  const doc = makeDoc()
  const { view, root } = makeView()
  const exact = fakeLabel(root, {
    data: {
      transitionId: 't-short',
      cond: 'x && z',
      event: 'go',
      target: 'run',
    },
  })
  const fallback = fakeLabel(root, {
    event: 'other',
    condText: '[x && y]',
    title: 'other [x && y] → run',
  })

  const exactFacts = labelFacts(exact)
  assert(exactFacts.transitionId === 't-short', 'LabelFacts 读取 data-transition-id')
  assert(exactFacts.cond === 'x && z', 'LabelFacts 读取完整 data-cond')
  assert(exactFacts.events[0] === 'go' && exactFacts.targets[0] === 'run', 'LabelFacts 读取 data-event/data-target')
  assert(
    transitionForFacts(doc, exactFacts)?.id === 't-short',
    'transitionForFacts 优先精确 transition id',
  )

  const fallbackFacts = labelFacts(fallback)
  assert(fallbackFacts.transitionId === null, '旧标签没有 data-transition-id')
  assert(fallbackFacts.cond === null, '旧标签没有完整 cond')
  assert(
    transitionForFacts(doc, fallbackFacts)?.id === 't-short',
    '旧标签按 event/cond/target 回退匹配',
  )

  // 相同事件/目标/截断前缀：旧标签取文档顺序第一条，新标签用完整 cond 精确命中。
  const ambiguous = fakeLabel(root, {
    event: 'go',
    condText: '[x && …]',
    title: 'go [x && y] → run',
    data: { cond: 'x && z', event: 'go', target: 'run' },
  })
  assert(
    transitionForFacts(doc, labelFacts(ambiguous))?.id === 't-alt',
    'data-cond 消除截断前缀歧义',
  )
  const ambiguousFallback = fakeLabel(root, {
    event: 'go',
    condText: '[x && …]',
    title: 'go [x && y] → run',
  })
  assert(
    matchTransitionId(doc, labelFacts(ambiguousFallback)) === 't-prefix',
    'matchTransitionId 的旧前缀回退仍可用',
  )
  assert(
    transitionForFacts(doc, labelFacts(fakeLabel(root, {
      event: '',
      condText: '[ready]',
      title: 'ε [ready]',
    })))?.id === 't-internal',
    '无 target 的内部 chip 可匹配',
  )
}

// B. placeTooltip
{
  const above = placeTooltip(
    { left: 100, top: 200, bottom: 220, width: 40, height: 20 },
    { width: 200, height: 50 },
    { width: 800, height: 600 },
  )
  assert(above.above === true && above.left === 20 && above.top === 142, 'placeTooltip 上方居中')
  const below = placeTooltip(
    { left: 10, top: 10, bottom: 30, width: 40, height: 20 },
    { width: 200, height: 50 },
    { width: 300, height: 600 },
  )
  assert(below.above === false && below.left === 8 && below.top === 38, 'placeTooltip 空间不足翻到下方并夹边')
}

// C. controller interactions
{
  const doc = makeDoc()
  const { view, root } = makeView()
  const label = fakeLabel(root, {
    data: { transitionId: 't-long', cond: LONG, event: 'go', target: 'run' },
  })
  const control = createLabelTooltip(view, {
    getDoc: () => doc,
    showDelay: 0,
    hideDelay: 0,
  })
  await tick(30)

  assert(view.classList.contains('sce-label-tip'), '启用时 view 加 sce-label-tip')
  assert(label.getAttribute('tabindex') === '0', '有条件的 span 注入 tabindex=0')

  pointer(label, 'pointerover')
  await tick()
  const tip = document.querySelector<HTMLElement>('.sce-label-tooltip')
  assert(!!tip && !tip.hidden, 'hover 显示 tooltip')
  assert(tip?.textContent === `[${LONG}]`, '默认显示完整 cond（不是 22 字符截断）')
  assert(label.getAttribute('title') === null, '显示期间移除原生 title')
  assert(tip?.getAttribute('aria-hidden') === 'true', '可见 tooltip 对 AT 隐藏')
  const describedBy = label.getAttribute('aria-describedby') ?? ''
  assert(!!describedBy, 'label 设置 aria-describedby')
  const desc = root.querySelector<HTMLElement>(`#${describedBy}`)
  assert(!!desc && desc.textContent === `[${LONG}]`, '描述节点在标签同一 shadow root')

  // 仿真重绘改写 title：tooltip 保持，title 再次被移除。
  label.setAttribute('title', 'go [inactive] → run')
  await tick()
  assert(label.getAttribute('title') === null, '外部改写 title 后再次移除')
  assert(!!tip && !tip.hidden, 'title 改写不影响 tooltip')

  pointer(label, 'pointerout', { relatedTarget: document.body })
  await tick()
  assert(!!tip?.hidden, 'pointerout 隐藏 tooltip')
  assert(label.getAttribute('title')?.includes(LONG) === true, '隐藏后恢复原始 title')
  assert(label.getAttribute('aria-describedby') === null, '隐藏后恢复 aria-describedby')

  // focus / Escape
  label.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true, composed: true }) as any)
  await tick()
  assert(!!tip && !tip.hidden, 'focusin 显示 tooltip')
  label.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }) as any)
  await tick()
  assert(!!tip?.hidden, 'Escape 隐藏 tooltip')

  // 触摸 tap：pointerup 小位移固定显示。
  label.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, composed: true }) as any)
  pointer(label, 'pointerdown', { pointerType: 'touch', clientX: 12, clientY: 12 })
  pointer(label, 'pointerup', { pointerType: 'touch', clientX: 14, clientY: 13 })
  await tick()
  assert(!!tip && !tip.hidden, '触摸 tap 显示 tooltip')

  // 外部 pointerdown 关闭 pin。
  pointer(document.body, 'pointerdown')
  await tick()
  assert(!!tip?.hidden, '点击外部关闭触摸 pin')

  control.destroy()
  await tick()
  assert(!document.querySelector('.sce-label-tooltip'), 'destroy 移除 tooltip 节点')
  assert(label.getAttribute('tabindex') === null, 'destroy 移除注入的 tabindex')
  assert(!view.classList.contains('sce-label-tip'), 'destroy 移除 view class')
  view.remove()
}

// D. passive、formatter、重建/清理
{
  const doc = makeDoc()
  const { view, root } = makeView()
  const label = fakeLabel(root, {
    data: { transitionId: 't-short', cond: 'x && y', event: 'other', target: 'run' },
  })
  const control = createLabelTooltip(view, {
    getDoc: () => doc,
    passive: true,
    showDelay: 0,
    hideDelay: 0,
    formatter: (t) => `event: ${t.event} cond: ${t.cond}`,
  })
  await tick(30)
  assert(view.classList.contains('sce-label-tip-passive'), 'passive 时加 passive class')
  pointer(label, 'pointerover')
  await tick()
  const tip = document.querySelector<HTMLElement>('.sce-label-tooltip')
  assert(tip?.textContent === 'event: other cond: x && y', 'formatter 覆盖默认文案')

  // 重建标签：旧标签断开时隐藏，新标签仍可显示。
  label.remove()
  await tick()
  assert(!!tip?.hidden, '活动标签断开后隐藏')
  const next = fakeLabel(root, {
    data: { transitionId: 't-short', cond: 'x && y', event: 'other', target: 'run' },
  })
  pointer(next, 'pointerover')
  await tick()
  assert(!!tip && !tip.hidden && tip.textContent?.includes('x && y') === true, '重绘后的新标签可显示')

  control.update()
  await tick()
  assert(!!tip?.hidden, 'update 隐藏当前 tooltip')
  control.destroy()
  view.remove()
}

// E. 快速划过：show 定时器必须被 pointerout 取消
{
  const doc = makeDoc()
  const { view, root } = makeView()
  const label = fakeLabel(root, {
    data: { transitionId: 't-long', cond: LONG, event: 'go', target: 'run' },
  })
  const control = createLabelTooltip(view, {
    getDoc: () => doc,
    showDelay: 40,
    hideDelay: 0,
  })
  pointer(label, 'pointerover')
  pointer(label, 'pointerout', { relatedTarget: document.body })
  await tick(100)
  const tip = document.querySelector<HTMLElement>('.sce-label-tooltip')
  assert(!tip || tip.hidden, '快速划过标签后不弹出 tooltip')
  control.destroy()
  view.remove()
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
