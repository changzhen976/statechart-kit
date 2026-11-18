/**
 * 转移标签完整条件 tooltip 的 DOM controller。
 *
 * 不依赖 Vue：宿主可以用 <ScxmlLabelTooltip>，也可以直接 createLabelTooltip()。
 * 结构化的标签事实与文档转移匹配在 canvas-contract.ts，这里只负责交互、定位、
 * 原生 title 抑制和可访问性。
 */
import type { ProjectDoc, TransitionEdge } from '../core/model'
import {
  RENDERER_CONTRACT,
  edgeLabelFromEvent,
  labelFacts,
  transitionForFacts,
  type LabelFacts,
} from './canvas-contract'

export type LabelTooltipFormatter = (
  transition: TransitionEdge,
  facts: LabelFacts,
  doc: ProjectDoc,
) => string

export interface LabelTooltipProps {
  view: HTMLElement | null
  doc: ProjectDoc | null
  /** 省略时默认启用；显式 false 关闭 */
  enabled?: boolean
  /** passive 画布：只恢复标签的 pointer-events */
  passive?: boolean
  formatter?: LabelTooltipFormatter
}

export interface LabelTooltipOptions {
  getDoc: () => ProjectDoc | null
  /** 默认 true；返回 false 时隐藏并停止注入 tabindex */
  enabled?: () => boolean
  /** passive 画布：只恢复标签的 pointer-events */
  passive?: boolean
  formatter?: LabelTooltipFormatter
  /** 默认 120ms */
  showDelay?: number
  /** 默认 80ms */
  hideDelay?: number
}

export interface LabelTooltipController {
  /** 文档/启用状态变化后调用；会隐藏当前提示并重扫标签 */
  update(): void
  hide(): void
  destroy(): void
}

export interface RectLike {
  left: number
  top: number
  bottom: number
  width: number
  height: number
}

export interface TooltipPlacement {
  left: number
  top: number
  above: boolean
}

const DEFAULT_SHOW_DELAY = 120
const DEFAULT_HIDE_DELAY = 80
const TOOLTIP_CLASS = 'sce-label-tooltip'
const VIEW_CLASS = 'sce-label-tip'
const PASSIVE_CLASS = 'sce-label-tip-passive'
const FOCUS_MARK = 'data-sce-tip-focus'
const SR_ONLY_CSS =
  '.sce-sr-only{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important;}'
const SR_ONLY_INLINE =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0;'
const CLICK_SLOP = 8
const TAP_MS = 500
const GAP = 8

let nextTipId = 0
const styledRoots = new WeakSet<object>()

function isShadowRoot(node: Node): node is ShadowRoot {
  return (
    (typeof ShadowRoot !== 'undefined' && node instanceof ShadowRoot) ||
    (node.nodeType === 11 && typeof (node as ShadowRoot).host !== 'undefined')
  )
}

function ensureSrOnlyStyle(root: ShadowRoot, span: HTMLElement): void {
  if (styledRoots.has(root)) return
  try {
    if (typeof CSSStyleSheet === 'undefined') throw new Error('CSSStyleSheet unavailable')
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(SR_ONLY_CSS)
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
    styledRoots.add(root)
  } catch {
    span.style.cssText = SR_ONLY_INLINE
  }
}

/** 计算 tooltip 位置；独立出来便于单测。 */
export function placeTooltip(
  anchor: RectLike,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = GAP,
): TooltipPlacement {
  const above = anchor.top >= size.height + gap + 4
  let left = anchor.left + anchor.width / 2 - size.width / 2
  if (viewport.width > 0) {
    left = Math.min(Math.max(left, gap), Math.max(gap, viewport.width - size.width - gap))
  }
  let top = above ? anchor.top - size.height - gap : anchor.bottom + gap
  if (viewport.height > 0 && top + size.height > viewport.height - gap) {
    top = Math.max(gap, viewport.height - size.height - gap)
  }
  return { left: Math.round(left), top: Math.round(top), above }
}

export function createLabelTooltip(
  view: HTMLElement,
  options: LabelTooltipOptions,
): LabelTooltipController {
  const doc = view.ownerDocument
  const win = doc?.defaultView ?? (typeof window !== 'undefined' ? window : null)
  const showDelay = options.showDelay ?? DEFAULT_SHOW_DELAY
  const hideDelay = options.hideDelay ?? DEFAULT_HIDE_DELAY
  const tipId = `sce-label-tooltip-${++nextTipId}`
  const descId = `${tipId}-desc`

  let enabled = false
  let destroyed = false
  let tooltip: HTMLDivElement | null = null
  let activeLabel: HTMLElement | null = null
  let savedTitle: string | null = null
  let savedAria: string | null = null
  let desc: HTMLElement | null = null
  let titleObserver: MutationObserver | null = null
  let rootObserver: MutationObserver | null = null
  let observedRoot: Node | null = null
  let resizeObserver: ResizeObserver | null = null
  let showTimer: ReturnType<typeof setTimeout> | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let rootTimer: ReturnType<typeof setTimeout> | null = null
  let focusRaf = 0
  let touchStart: { x: number; y: number; at: number } | null = null
  let pinned = false

  const later = (fn: () => void, ms: number): ReturnType<typeof setTimeout> => setTimeout(fn, ms)
  const raf = (fn: () => void): number => {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn)
    return setTimeout(fn, 0) as unknown as number
  }
  const cancelRaf = (id: number): void => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id)
    else clearTimeout(id)
  }

  function clearShowTimer(): void {
    if (showTimer) {
      clearTimeout(showTimer)
      showTimer = null
    }
  }

  function clearHideTimer(): void {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function clearRootTimer(): void {
    if (rootTimer) {
      clearTimeout(rootTimer)
      rootTimer = null
    }
  }

  function syncClasses(): void {
    view.classList.toggle(VIEW_CLASS, enabled)
    view.classList.toggle(PASSIVE_CLASS, enabled && options.passive === true)
  }

  function applyEnabled(): void {
    const next = options.enabled ? options.enabled() : true
    if (next === enabled) {
      syncClasses()
      return
    }
    enabled = next
    if (!enabled) hide()
    syncClasses()
    if (enabled) {
      ensureRootObserver()
      scheduleRootCheck()
      scheduleFocusable()
    }
  }

  function format(transition: TransitionEdge, facts: LabelFacts, sourceDoc: ProjectDoc): string {
    if (options.formatter) {
      try {
        return options.formatter(transition, facts, sourceDoc).trim()
      } catch (error) {
        console.warn('[statechart-kit] label tooltip formatter failed', error)
      }
    }
    return transition.cond ? `[${transition.cond}]` : ''
  }

  function ensureTooltip(): HTMLDivElement {
    if (tooltip?.isConnected) return tooltip
    const el = doc.createElement('div')
    el.className = TOOLTIP_CLASS
    el.setAttribute('role', 'tooltip')
    el.setAttribute('aria-hidden', 'true')
    ;(doc.body ?? doc.documentElement).append(el)
    tooltip = el
    return el
  }

  function position(label: HTMLElement, tip: HTMLDivElement): void {
    const size = { width: tip.offsetWidth || 0, height: tip.offsetHeight || 0 }
    const viewport = {
      width: win?.innerWidth ?? 0,
      height: win?.innerHeight ?? 0,
    }
    const placed = placeTooltip(label.getBoundingClientRect(), size, viewport)
    tip.style.left = `${placed.left}px`
    tip.style.top = `${placed.top}px`
    tip.classList.toggle('sce-label-tooltip-below', !placed.above)
  }

  function removeDescription(): void {
    if (desc?.isConnected) desc.remove()
    desc = null
  }

  function createDescription(label: HTMLElement, text: string): void {
    removeDescription()
    const root = label.getRootNode()
    const span = doc.createElement('span')
    span.id = descId
    span.className = 'sce-sr-only'
    span.textContent = text
    if (isShadowRoot(root)) {
      root.append(span)
      ensureSrOnlyStyle(root, span)
    } else {
      ;(doc.body ?? doc.documentElement).append(span)
    }
    desc = span
    label.setAttribute('aria-describedby', descId)
  }

  function observeTitle(label: HTMLElement): void {
    titleObserver?.disconnect()
    if (typeof MutationObserver === 'undefined') return
    titleObserver = new MutationObserver(() => {
      if (activeLabel !== label || !label.hasAttribute('title')) return
      titleObserver?.disconnect()
      label.removeAttribute('title')
      titleObserver?.observe(label, { attributes: true, attributeFilter: ['title'] })
    })
    titleObserver.observe(label, { attributes: true, attributeFilter: ['title'] })
  }

  function show(label: HTMLElement): void {
    if (destroyed || !enabled) return
    if (activeLabel === label) return
    hide()

    const sourceDoc = options.getDoc()
    if (!sourceDoc) return
    const facts = labelFacts(label, RENDERER_CONTRACT.eventless)
    const transition = transitionForFacts(sourceDoc, facts)
    if (!transition || !transition.cond) return
    const text = format(transition, facts, sourceDoc)
    if (!text) return

    activeLabel = label
    savedTitle = label.getAttribute('title')
    savedAria = label.getAttribute('aria-describedby')
    label.removeAttribute('title')
    createDescription(label, text)

    const tip = ensureTooltip()
    tip.textContent = text
    tip.hidden = false
    tip.setAttribute('aria-hidden', 'true')
    position(label, tip)
    observeTitle(label)
    pinned = false
  }

  function hide(): void {
    clearShowTimer()
    clearHideTimer()
    titleObserver?.disconnect()
    titleObserver = null

    const label = activeLabel
    if (label?.isConnected) {
      if (savedTitle !== null) label.setAttribute('title', savedTitle)
      else label.removeAttribute('title')
      if (savedAria !== null) label.setAttribute('aria-describedby', savedAria)
      else label.removeAttribute('aria-describedby')
    }

    removeDescription()
    if (tooltip) {
      tooltip.hidden = true
      tooltip.textContent = ''
    }
    activeLabel = null
    savedTitle = null
    savedAria = null
    pinned = false
    touchStart = null
  }

  function scheduleHide(): void {
    clearHideTimer()
    if (hideDelay <= 0) {
      hide()
      return
    }
    hideTimer = later(() => {
      hideTimer = null
      hide()
    }, hideDelay)
  }

  function scheduleShow(label: HTMLElement): void {
    clearShowTimer()
    if (showDelay <= 0) {
      show(label)
      return
    }
    showTimer = later(() => {
      showTimer = null
      show(label)
    }, showDelay)
  }

  function ensureFocusable(): void {
    if (!enabled || destroyed) return
    const root: ParentNode = view.shadowRoot ?? view
    for (const label of Array.from(
      root.querySelectorAll<HTMLElement>(`[part~="${RENDERER_CONTRACT.edgeLabelPart}"]`),
    )) {
      const dataCond = label.getAttribute(RENDERER_CONTRACT.condAttr)
      const hasCond =
        dataCond !== null
          ? dataCond.length > 0
          : !!label.querySelector(`[part~="${RENDERER_CONTRACT.condPart}"]`)
      if (!hasCond) continue
      if (label.localName === 'button') continue
      if (label.hasAttribute('tabindex')) continue
      label.tabIndex = 0
      label.setAttribute(FOCUS_MARK, '1')
    }
  }

  function clearFocusable(): void {
    const root: ParentNode = view.shadowRoot ?? view
    for (const label of Array.from(root.querySelectorAll<HTMLElement>(`[${FOCUS_MARK}]`))) {
      label.removeAttribute('tabindex')
      label.removeAttribute(FOCUS_MARK)
    }
  }

  function scheduleFocusable(): void {
    if (focusRaf) return
    focusRaf = raf(() => {
      focusRaf = 0
      ensureFocusable()
    })
  }

  function onRootMutation(): void {
    if (activeLabel && !activeLabel.isConnected) hide()
    scheduleFocusable()
  }

  function ensureRootObserver(): void {
    const root: Node = view.shadowRoot ?? view
    if (root === observedRoot) return
    rootObserver?.disconnect()
    observedRoot = root
    if (typeof MutationObserver === 'undefined') return
    rootObserver = new MutationObserver(onRootMutation)
    rootObserver.observe(root, { childList: true, subtree: true })
  }

  function scheduleRootCheck(): void {
    clearRootTimer()
    rootTimer = later(() => {
      rootTimer = null
      ensureRootObserver()
      scheduleFocusable()
    }, 100)
  }

  function labelFrom(event: Event): HTMLElement | null {
    return edgeLabelFromEvent(event)
  }

  function labelHasFocus(label: HTMLElement): boolean {
    const root = label.getRootNode()
    if (isShadowRoot(root) && root.activeElement === label) return true
    return doc.activeElement === label
  }

  function onPointerOver(event: Event): void {
    if (!enabled) return
    const label = labelFrom(event)
    if (!label) return
    clearHideTimer()
    if (activeLabel === label) return
    scheduleShow(label)
  }

  function onPointerOut(event: Event): void {
    const label = labelFrom(event)
    const related = (event as PointerEvent).relatedTarget as Node | null
    // 标签内部 span 之间移动不算离开；同时清掉尚未触发的 show 定时器，
    // 避免快速划过标签后 tooltip 迟到弹出。
    if (related && label?.contains(related)) return
    if (related && activeLabel?.contains(related)) return
    clearShowTimer()
    if (!activeLabel || pinned) return
    if (labelHasFocus(activeLabel)) return
    if (label && label !== activeLabel) return
    scheduleHide()
  }

  function onPointerDown(event: PointerEvent): void {
    if (!enabled) return
    clearShowTimer()
    if (event.pointerType === 'touch') {
      touchStart = { x: event.clientX, y: event.clientY, at: Date.now() }
      return
    }
    touchStart = null
    if (!pinned) hide()
  }

  function onPointerUp(event: PointerEvent): void {
    if (!touchStart) return
    const start = touchStart
    touchStart = null
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (moved > CLICK_SLOP || Date.now() - start.at > TAP_MS) return
    const label = labelFrom(event)
    if (label) {
      show(label)
      pinned = true
    } else {
      hide()
    }
  }

  function onPointerCancel(): void {
    clearShowTimer()
    touchStart = null
  }

  function onDocumentPointerDown(event: PointerEvent): void {
    clearShowTimer()
    if (!activeLabel) return
    if (event.composedPath().includes(activeLabel)) return
    hide()
  }

  function onFocusIn(event: Event): void {
    if (!enabled) return
    const label = labelFrom(event)
    if (!label) return
    clearHideTimer()
    show(label)
  }

  function onFocusOut(event: FocusEvent): void {
    if (!activeLabel) return
    const related = event.relatedTarget as Node | null
    if (related && activeLabel.contains(related)) return
    scheduleHide()
  }

  function onWheel(): void {
    hide()
  }

  function onScroll(): void {
    hide()
  }

  function onResize(): void {
    hide()
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && activeLabel) {
      hide()
    }
  }

  function onScxmlLoad(): void {
    hide()
    ensureRootObserver()
    scheduleRootCheck()
    scheduleFocusable()
  }

  view.addEventListener('pointerover', onPointerOver)
  view.addEventListener('pointerout', onPointerOut)
  view.addEventListener('pointerdown', onPointerDown)
  view.addEventListener('pointerup', onPointerUp)
  view.addEventListener('pointercancel', onPointerCancel)
  view.addEventListener('focusin', onFocusIn)
  view.addEventListener('focusout', onFocusOut)
  view.addEventListener('wheel', onWheel, { passive: true })
  view.addEventListener('keydown', onKeydown)
  view.addEventListener('scxml-load', onScxmlLoad)
  doc?.addEventListener('pointerdown', onDocumentPointerDown, true)
  win?.addEventListener('scroll', onScroll, true)
  win?.addEventListener('resize', onResize)

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(view)
  }

  applyEnabled()
  ensureRootObserver()
  scheduleRootCheck()
  scheduleFocusable()

  return {
    update(): void {
      if (destroyed) return
      hide()
      applyEnabled()
      ensureRootObserver()
      scheduleRootCheck()
      scheduleFocusable()
    },
    hide,
    destroy(): void {
      if (destroyed) return
      destroyed = true
      hide()
      clearRootTimer()
      if (focusRaf) {
        cancelRaf(focusRaf)
        focusRaf = 0
      }
      titleObserver?.disconnect()
      titleObserver = null
      rootObserver?.disconnect()
      rootObserver = null
      resizeObserver?.disconnect()
      resizeObserver = null
      view.removeEventListener('pointerover', onPointerOver)
      view.removeEventListener('pointerout', onPointerOut)
      view.removeEventListener('pointerdown', onPointerDown)
      view.removeEventListener('pointerup', onPointerUp)
      view.removeEventListener('pointercancel', onPointerCancel)
      view.removeEventListener('focusin', onFocusIn)
      view.removeEventListener('focusout', onFocusOut)
      view.removeEventListener('wheel', onWheel)
      view.removeEventListener('keydown', onKeydown)
      view.removeEventListener('scxml-load', onScxmlLoad)
      doc?.removeEventListener('pointerdown', onDocumentPointerDown, true)
      win?.removeEventListener('scroll', onScroll, true)
      win?.removeEventListener('resize', onResize)
      clearFocusable()
      view.classList.remove(VIEW_CLASS, PASSIVE_CLASS)
      if (tooltip) {
        tooltip.remove()
        tooltip = null
      }
    },
  }
}
