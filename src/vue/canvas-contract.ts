/**
 * 官方 `<scxml-view>` 渲染契约（内部模块）。
 *
 * 这里集中维护 shadow DOM 的 part / data 属性读取，避免 ChartCanvas 的点击选中、
 * tooltip 和宿主包装器各自复制一份契约。
 *
 * 优先读取渲染器（或上游后续版本）暴露的结构化属性：
 *   data-transition-id / data-cond / data-event / data-target
 * 旧渲染器回退到 part / title 文本。
 */
import { defaultViewStrings } from '@tinyactors/scxmljs/view'
import type { ProjectDoc, TransitionEdge } from '../core/model'
import { matchTransitionId } from './canvas-select'

export interface LabelFacts {
  label: HTMLElement
  /** 结构化转移 id；旧渲染器没有该属性时为 null */
  transitionId: string | null
  /** 完整条件；旧渲染器只能拿到截断文本，因此为 null */
  cond: string | null
  /** `[part="cond"]` 的可见文本（含方括号，可能截断） */
  condText: string
  events: string[]
  targets: string[]
  eventless: string
}

export const RENDERER_CONTRACT = {
  /** 转移标签的 part 名（part 属性空格分隔之一） */
  edgeLabelPart: 'edge-label',
  /** 状态容器的 data 属性名 */
  stateAttr: 'data-state',
  /** 官方事件名部件 */
  eventPart: 'event',
  /** 官方条件部件（文本含方括号） */
  condPart: 'cond',
  /** eventless 占位词（与官方渲染同源） */
  eventless: defaultViewStrings.eventless,
  /** title 中指向目标列表的箭头分隔符 */
  titleArrow: '→',
  /** 真交互控件（官方发送/播放/折叠按钮等）；edge-label 是 SPAN 不在其中 */
  interactive: 'button, a, input, select, textarea, label, summary, [role="button"]',
  /** 结构化转移 id（kit 序列化器写 data-kit-transition-id，上游透传） */
  transitionIdAttr: 'data-transition-id',
  /** 完整条件文本（不截断） */
  condAttr: 'data-cond',
  /** 事件描述符（空格分隔；空字符串表示 eventless） */
  eventAttr: 'data-event',
  /** 目标 id 列表（逗号分隔；空字符串表示无 target） */
  targetAttr: 'data-target',
} as const

function hasPart(el: HTMLElement, part: string): boolean {
  return (el.getAttribute('part') ?? '').split(/\s+/).includes(part)
}

/** composedPath 上最近的官方转移标签（shadow DOM open）。 */
export function edgeLabelFromPath(path: EventTarget[]): HTMLElement | null {
  for (const node of path) {
    if (node instanceof HTMLElement && hasPart(node, RENDERER_CONTRACT.edgeLabelPart)) return node
  }
  return null
}

export function edgeLabelFromEvent(event: Event): HTMLElement | null {
  return edgeLabelFromPath(event.composedPath())
}

/** 读取一个标签的转移事实；结构化属性优先，旧渲染器回退。 */
export function labelFacts(label: HTMLElement, eventless = RENDERER_CONTRACT.eventless): LabelFacts {
  const rawId = label.getAttribute(RENDERER_CONTRACT.transitionIdAttr)
  const transitionId = rawId && rawId.trim() ? rawId.trim() : null

  const rawCond = label.getAttribute(RENDERER_CONTRACT.condAttr)
  const cond = rawCond === null ? null : rawCond

  const condText = (label.querySelector(`[part~="${RENDERER_CONTRACT.condPart}"]`)?.textContent ?? '').trim()

  let events: string[]
  if (label.hasAttribute(RENDERER_CONTRACT.eventAttr)) {
    const raw = (label.getAttribute(RENDERER_CONTRACT.eventAttr) ?? '').trim()
    events = raw ? raw.split(/\s+/) : []
  } else {
    events = Array.from(label.querySelectorAll(`[part~="${RENDERER_CONTRACT.eventPart}"]`))
      .map((span) => span.textContent?.trim() ?? '')
      .filter(Boolean)
  }

  let targets: string[]
  if (label.hasAttribute(RENDERER_CONTRACT.targetAttr)) {
    targets = (label.getAttribute(RENDERER_CONTRACT.targetAttr) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  } else {
    const title = label.getAttribute('title') ?? ''
    const arrow = title.lastIndexOf(RENDERER_CONTRACT.titleArrow)
    targets = (arrow >= 0 ? title.slice(arrow + 1) : '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  return { label, transitionId, cond, condText, events, targets, eventless }
}

export function labelFromEvent(
  event: Event,
  eventless = RENDERER_CONTRACT.eventless,
): { label: HTMLElement; facts: LabelFacts } | null {
  const label = edgeLabelFromEvent(event)
  if (!label) return null
  return { label, facts: labelFacts(label, eventless) }
}

/**
 * 标签事实 → 文档转移。
 *
 * 1. 结构化 transition id 精确命中；
 * 2. 完整 cond 精确匹配；
 * 3. 旧渲染器走截断前缀匹配。
 */
export function transitionForFacts(doc: ProjectDoc, facts: LabelFacts): TransitionEdge | null {
  if (facts.transitionId) {
    const exact = doc.transitions.find((t) => t.id === facts.transitionId)
    if (exact) return exact
  }
  const id = matchTransitionId(doc, {
    events: facts.events,
    condText: facts.condText,
    condFull: facts.cond,
    targets: facts.targets,
    eventless: facts.eventless,
  })
  return id ? (doc.transitions.find((t) => t.id === id) ?? null) : null
}

/** 真 <button> 等交互元素（穿透 shadow DOM），保持官方语义不参与选中。 */
export function isInteractiveTarget(event: Event): boolean {
  return event
    .composedPath()
    .some((node) => node instanceof HTMLElement && node.matches(RENDERER_CONTRACT.interactive))
}

/** composedPath 上最内层的 [data-state] 元素（嵌套容器取最内层）。 */
export function stateIdFromEvent(event: Event): string | null {
  for (const node of event.composedPath()) {
    if (node instanceof HTMLElement && node.hasAttribute(RENDERER_CONTRACT.stateAttr)) {
      return node.getAttribute(RENDERER_CONTRACT.stateAttr)
    }
  }
  return null
}
