<script setup lang="ts">
/**
 * 主视图宿主：嵌入官方 <scxml-view>，实现"编辑 → 序列化 → 官方重绘"闭环，
 * 并提供点击选中（状态/转移）与缩放/平移层。
 *
 * 两种模式（互斥）：
 * - 编辑态（默认）：把防抖后的 SCXML 文本写入 `source` 属性 + `autostart="false"`
 *   —— 元素只绘制图表、不启动会话，与 playground 观感完全一致。
 * - 仿真态（editor.sim.running）：把 runner 创建的会话挂到 `session` DOM 属性
 *   —— 元素跟随会话：激活态高亮、转移标签变为可点击发送事件的按钮。
 *   注意：对象属性必须用 DOM property 赋值，不能写 attribute。
 *
 * 缩放/平移层（当前引擎版本 0.2.0-dev.0 尚未包含原生缩放——main 分支已实现但
 * 未发版；上游发版后本层可整体移除）。
 *
 * 关键设计——大画布：元素本身是一个"视口"（固定 100%×100% 时会内部缩小到
 * 0.65 + 内部滚动，超出部分被自己的边界裁掉，外层缩放只能缩这个被裁的盒子）。
 * 因此给元素一个**固定大画布**（6000×4000，远大于常规图表自然尺寸），元素按
 * 1:1 全量绘制、内部不缩不放；裁剪边界只保留外层 .zoom-pan 一处，缩放/平移
 * 即为在完整图上的导航。"适应窗口"通过 open shadowRoot 读取 canvas 的
 * scrollWidth/Height 计算适配比例并居中。
 *
 * 手势：
 * - 手势阈值模型：pointerdown 只记录起点不捕获；位移 ≥5px 进入平移（此刻才
 *   setPointerCapture）；抬起时位移 <5px 判定为"点击"→ 走选中链路。因此标签
 *   点击、折叠按钮、状态选中与平移拖拽互不干扰。
 * - Ctrl+滚轮：以指针为中心缩放（0.3–3x）；普通滚轮/触摸板：平移。
 * - 官方元素自带回放控件（part:controls）会随变换变形，由 app.css 全局隐藏，
 *   统一由底部 SimBar 控制。
 *
 * 点击选中（shadow DOM 下 e.target 被 retarget 成宿主，必须用 composedPath 穿透）：
 * - 状态盒子：元素给每个盒子写了 `data-state="<id>"`（含 history 的 H/H*）。
 * - 转移标签（编辑态）：元素不给标签转移标识，用"事件 span(精确) + title 目标
 *   列表(精确) + cond(截断则前缀)"组合匹配到文档转移；仿真态保持官方语义
 *   （点击标签=发送事件）。
 *
 * 防抖：属性面板连续输入时避免每次按键都重新编译绘制（250ms）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import '@tinyactors/scxmljs/view'
import { defaultViewStrings } from '@tinyactors/scxmljs/view'
import { serializeToScxml } from '../core/serializer'
import { createEngineSession } from '../engine/engine-loader'
import { useEditor } from './use-editor'
import { matchTransitionId } from './canvas-select'
import {
  CANVAS_INITIAL_H,
  CANVAS_INITIAL_W,
  CANVAS_PADDING,
  SCALE_MAX,
  SCALE_MIN,
  fitScale,
  growCanvas,
} from './canvas-fit'

const editor = useEditor()

const selectionText = computed(() => {
  if (editor.selection.kind === 'state' && editor.selectedState) {
    return `状态：${editor.selectedState.label || editor.selectedState.id}（${editor.selectedState.id}）`
  }
  if (editor.selection.kind === 'transition' && editor.selectedTransition) {
    const t = editor.selectedTransition
    return `转移：${editor.stateName(t.source)} → ${editor.stateName(t.target)}`
  }
  return ''
})
const viewEl = ref<any>(null)
const panEl = ref<HTMLElement | null>(null)
const explorerEl = ref<any>(null)
const explorerOn = ref(false)
const explorerStateUid = ref<string | null>(editor.selectedState?.uid ?? null)
let explorerLoad: Promise<unknown> | null = null
let previewSession: { dispose(): void } | null = null
let previewTimer: ReturnType<typeof setTimeout> | null = null
let previewGen = 0

const explorerState = computed(() =>
  explorerStateUid.value === null
    ? null
    : (editor.doc.states.find((s) => s.uid === explorerStateUid.value) ?? null),
)
const explorerTransitions = computed(() =>
  explorerState.value
    ? editor.doc.transitions.filter((t) => t.source === explorerState.value!.uid)
    : [],
)

/** 视口尺寸只用于 auto 断点；画布尺寸独立，保证横向内容有完整绘制空间。 */
const viewportW = ref(CANVAS_INITIAL_W)
const viewportH = ref(CANVAS_INITIAL_H)
const canvasW = ref(CANVAS_INITIAL_W)
const canvasH = ref(CANVAS_INITIAL_H)
let ro: ResizeObserver | null = null
let directionFitTimer: ReturnType<typeof setTimeout> | null = null

// ───────────────── 布局方向管理 ─────────────────
// 不用元素的 direction="auto"：其内部只在"宽度大幅变化"时重排，侧栏开合等场景
// 会残留旧布局。改为：宽度滞回（down→right 需 ≥1100；right→down 只需 <900，
// 避免临界抖动）自动判定 + 用户可显式锁定纵向/横向。direction 属性赋值官方
// 语义即"重排"；赋值时机在 DOM 宽度应用之后（flush: 'post'），消除时序错位。

const NARROW_BREAK = 900 // 横向 → 纵向
const WIDE_BREAK = 1100 // 纵向 → 横向
const dirMode = ref<'auto' | 'down' | 'right'>('auto')
const dirName = ref<'down' | 'right'>('right')
let lastDirMode: 'auto' | 'down' | 'right' = 'auto'

function hysteresis(w: number): 'down' | 'right' {
  if (dirName.value === 'down') return w >= WIDE_BREAK ? 'right' : 'down'
  return w < NARROW_BREAK ? 'down' : 'right'
}

watch(
  [dirMode, viewportW] as const,
  async ([m, w]) => {
    const modeChanged = m !== lastDirMode
    lastDirMode = m
    const want = m === 'auto' ? hysteresis(w) : m
    if (want === dirName.value) return
    dirName.value = want
    await nextTick() // 先让画布宽度样式生效，再赋方向重排
    const el = viewEl.value
    if (el) el.direction = want
    // 只有作者显式切换方向才自动 fit；窗口/侧栏 resize 导致的 auto 切换
    // 不重置用户当前缩放（需求 KIT-014 的“侧栏调宽不强制重置视图”）。
    if (!modeChanged) return
    // 官方 view 在 direction 赋值后异步重排；双 rAF + 延迟兜底，避免量到旧布局。
    if (directionFitTimer) clearTimeout(directionFitTimer)
    await nextTick()
    requestAnimationFrame(() => {
      fitView()
      directionFitTimer = setTimeout(() => {
        directionFitTimer = null
        fitView()
      }, 140)
    })
  },
  { flush: 'post' },
)


let timer: ReturnType<typeof setTimeout> | null = null

/** 把当前文档序列化后推给官方渲染器（仅编辑态） */
function pushSource(): void {
  const el = viewEl.value
  if (!el || editor.sim.running) return
  el.source = serializeToScxml(editor.doc)
  scheduleContractProbe()
}

let probeTimer: ReturnType<typeof setTimeout> | null = null
/**
 * 官方渲染契约探测：文档含「会渲染标签的转移」（有事件或有 cond）但画布
 * 找不到任何 edge-label → 官方结构变化，画布点击选中已静默失效。
 * 把这类失效从「用户无感知的功能坏死」变成 console 可发现。
 */
function scheduleContractProbe(): void {
  if (probeTimer) clearTimeout(probeTimer)
  probeTimer = setTimeout(() => {
    const root = (viewEl.value as unknown as { shadowRoot?: ShadowRoot })?.shadowRoot
    if (!root) return
    const labelWorthy = editor.doc.transitions.some((t) => t.event || t.cond)
    const labels = root.querySelectorAll(`[part~="${OFFICIAL.edgeLabelPart}"]`).length
    if (labelWorthy && labels === 0) {
      console.warn(
        '[ChartViewHost] 官方渲染契约变化：文档含转移但画布无 edge-label，画布点击选中转移已失效——请核对 OFFICIAL 契约常量（ChartViewHost 源码头部）并跑 scripts/check-canvas-select.cjs',
      )
    }
  }, 600)
}

let fitTimer: ReturnType<typeof setTimeout> | null = null
/** 等元素完成编译绘制后量取内容尺寸并适应窗口 */
function scheduleFit(): void {
  if (fitTimer) clearTimeout(fitTimer)
  fitTimer = setTimeout(() => fitView(), 400)
}

// 深层编辑（同一 doc 引用）→ 防抖重绘；不自动适应，避免打断用户的缩放/平移
watch(
  () => editor.doc,
  () => {
    if (editor.sim.running) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(pushSource, 250)
  },
  { deep: true },
)

// 整文档替换（打开工程/示例/新建）→ 重绘并自动适应一次
watch(
  () => editor.doc,
  () => {
    if (editor.sim.running) return
    scheduleFit()
  },
)

// 仿真状态翻转：运行时附加会话；停止后回到 source 模式并恢复最新文档。
// 每次开始/结束仿真把视图切回"整图"并复位缩放，Explorer 只在本次运行中按需进入。
watch(
  () => editor.sim.running,
  (running) => {
    resetView()
    const el = viewEl.value
    if (el) {
      if (running) {
        el.session = editor.runner.sessionOrNull ?? undefined
      } else {
        el.session = undefined
        pushSource()
      }
    }
    if (running) {
      if (explorerOn.value) {
        disposePreviewSession()
        detachExplorer()
        void attachLiveExplorer()
      }
      return
    }
    detachExplorer()
    disposePreviewSession()
    if (explorerOn.value && editor.features.explorer) {
      void reloadPreviewExplorer()
    } else {
      explorerOn.value = false
    }
  },
)

// ───────────────── Explorer（官方 <scxml-explorer>） ─────────────────
// 仿真时 attach runner 的活会话；编辑时 attach 一个 **未 start** 的预览会话，
// 只编译模型、不执行 entry/定时器/脚本。按需动态加载 explorer。

async function ensureExplorerLoaded(): Promise<void> {
  if (!explorerLoad) {
    explorerLoad = import('@tinyactors/scxmljs/explorer').catch((err) => {
      explorerLoad = null
      throw err
    })
  }
  await explorerLoad
}

function configureExplorer(el: any): void {
  if (editor.adapter.explorerStrings) el.strings = editor.adapter.explorerStrings
}

function detachExplorer(): void {
  const el = explorerEl.value
  if (!el) return
  try {
    el.detach?.()
  } catch {
    /* 元素已卸载时忽略 */
  }
}

function disposePreviewSession(): void {
  previewGen++
  if (previewTimer) {
    clearTimeout(previewTimer)
    previewTimer = null
  }
  previewSession?.dispose()
  previewSession = null
}

async function attachLiveExplorer(): Promise<void> {
  if (!explorerOn.value || !editor.sim.running) return
  const session = editor.runner.sessionOrNull
  if (!session) {
    explorerOn.value = false
    return
  }
  try {
    await ensureExplorerLoaded()
    await nextTick()
    if (!explorerOn.value || !editor.sim.running) return
    const el = explorerEl.value
    if (!el) return
    disposePreviewSession()
    configureExplorer(el)
    el.attach({ session })
  } catch (err) {
    explorerOn.value = false
    editor.pushLog(
      'system',
      `Explorer 加载失败：${err instanceof Error ? err.message : String(err)}`,
      'error',
    )
  }
}

async function reloadPreviewExplorer(): Promise<void> {
  if (!explorerOn.value || editor.sim.running) return
  const gen = ++previewGen
  const xml = serializeToScxml(editor.doc)
  try {
    // 预览只编译模型，不 start；trusted 避免为了结构视图加载 QuickJS。
    const domParser = editor.adapter.domParser ?? editor.adapter.runner?.domParser
    const session = await createEngineSession(xml, {
      engine: 'trusted',
      ...(domParser ? { domParser } : {}),
    })
    if (gen !== previewGen || !explorerOn.value || editor.sim.running) {
      session.dispose()
      return
    }
    await ensureExplorerLoaded()
    await nextTick()
    if (gen !== previewGen || !explorerOn.value || editor.sim.running) {
      session.dispose()
      return
    }
    const el = explorerEl.value
    if (!el) {
      session.dispose()
      return
    }
    detachExplorer()
    previewSession?.dispose()
    previewSession = session
    configureExplorer(el)
    el.attach({ session })
  } catch (err) {
    if (gen !== previewGen) return
    previewSession?.dispose()
    previewSession = null
    editor.pushLog(
      'system',
      `Explorer 预览失败：${err instanceof Error ? err.message : String(err)}`,
      'error',
    )
  }
}

async function toggleExplorer(): Promise<void> {
  if (!editor.features.explorer) return
  if (explorerOn.value) {
    explorerOn.value = false
    detachExplorer()
    disposePreviewSession()
    return
  }
  explorerOn.value = true
  if (editor.sim.running) await attachLiveExplorer()
  else await reloadPreviewExplorer()
}

function onExplorerSelect(event: Event): void {
  const detail = (event as CustomEvent<{ state?: { id?: string } }>).detail
  const id = detail?.state?.id
  if (!id) return
  const state = editor.doc.states.find((s) => s.id === id)
  if (!state) return
  explorerStateUid.value = state.uid
  editor.select('state', state.uid)
}

function selectExplorerTransition(id: string): void {
  editor.select('transition', id)
}

watch(
  () => editor.state.revision,
  () => {
    if (!explorerOn.value || editor.sim.running) return
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = setTimeout(() => {
      previewTimer = null
      void reloadPreviewExplorer()
    }, 300)
  },
)

watch(
  () => editor.selection,
  (sel) => {
    if (sel.kind === 'state' && sel.id) explorerStateUid.value = sel.id
  },
  { deep: true },
)

onMounted(() => {
  pushSource()
  scheduleFit()
  // 画布尺寸跟随容器（最小宽 480 保证可读；<760 时元素 direction=auto 自动切纵向）
  if (panEl.value) {
    ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      viewportW.value = Math.max(480, Math.round(r.width))
      viewportH.value = Math.max(320, Math.round(r.height))
      // 画布只负责“装得下内容”；视口变化本身不 fit，保留用户当前缩放。
      const grown = growCanvas(canvasW.value, canvasH.value, viewportW.value, viewportH.value)
      if (grown.changed) {
        canvasW.value = grown.width
        canvasH.value = grown.height
      }
    })
    ro.observe(panEl.value)
  }
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
  if (directionFitTimer) clearTimeout(directionFitTimer)
  ro?.disconnect()
  detachExplorer()
  disposePreviewSession()
})

// ───────────────── 缩放 / 平移层（手势阈值模型） ─────────────────

const CLICK_SLOP = 5 // 位移小于该值视为点击，大于则进入平移

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const panning = ref(false)

/** 以某个视口点为中心缩放（保持该点下的图表内容不动） */
function zoomAt(cx: number, cy: number, factor: number): void {
  const el = panEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const px = cx - rect.left
  const py = cy - rect.top
  const ns = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale.value * factor))
  if (ns === scale.value) return
  tx.value = px - ((px - tx.value) / scale.value) * ns
  ty.value = py - ((py - ty.value) / scale.value) * ns
  scale.value = ns
}

function onWheel(e: WheelEvent): void {
  e.preventDefault() // 导航统一由外层承担（元素内部滚动条已隐藏）
  if (e.ctrlKey) {
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015))
    return
  }
  // 普通滚轮/触摸板：平移（支持触摸板横向 deltaX）
  tx.value -= e.deltaX
  ty.value -= e.deltaY
}

function zoomBy(factor: number): void {
  const el = panEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
}

function resetView(): void {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

/** 读取官方 view 的 diagram 内容尺寸（不是 .canvas 的滚动框尺寸）。 */
function contentSize(): { w: number; h: number } | null {
  const root = (viewEl.value as any)?.shadowRoot
  const diagram = root?.querySelector('.diagram') as HTMLElement | null
  if (!diagram) return null
  const w = diagram.offsetWidth
  const h = diagram.offsetHeight
  // .diagram 自身有 12px margin；offsetWidth/Height 不含 margin。
  return w > 0 && h > 0 ? { w: w + CANVAS_PADDING, h: h + CANVAS_PADDING } : null
}

/** 适应窗口：内容尺寸等比缩放并居中；内容超出大画布时先扩容再重试。 */
function fitView(): void {
  const el = panEl.value
  if (!el) return
  const size = contentSize()
  if (!size) {
    resetView()
    return
  }
  const grown = growCanvas(canvasW.value, canvasH.value, size.w, size.h)
  if (grown.changed) {
    canvasW.value = grown.width
    canvasH.value = grown.height
    requestAnimationFrame(() => fitView())
    return
  }
  const r = el.getBoundingClientRect()
  const s = fitScale(r.width, r.height, size.w, size.h)
  scale.value = s
  tx.value = (r.width - size.w * s) / 2
  ty.value = (r.height - size.h * s) / 2
}

interface Press {
  x: number
  y: number
  tx: number
  ty: number
  stateId: string | null
  tid: string | null
  interactive: boolean
}
let press: Press | null = null
let captured = false

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0 && e.button !== 1) return
  const interactive = isInteractiveTarget(e)
  // 转移标签：编辑态点击=选中（无会话时官方为空操作）；仿真态点击=发送事件（官方）
  // ——两种模式下都同步选中该转移，定位到左栏分组与属性面板。
  // 注意：官方 edge-label 是 SPAN（part="transition edge-label"），非 button——
  // 不能用 interactive 作匹配前置条件，否则所有转移的画布点击选中全部失效。
  const tid = transitionIdFromLabel(e)
  press = {
    x: e.clientX,
    y: e.clientY,
    tx: tx.value,
    ty: ty.value,
    stateId: stateIdFromEvent(e),
    tid,
    interactive,
  }
}

function onPointerMove(e: PointerEvent): void {
  if (!press) return
  const dx = e.clientX - press.x
  const dy = e.clientY - press.y
  if (!captured && Math.hypot(dx, dy) < CLICK_SLOP) return
  if (!captured) {
    captured = true
    panning.value = true
    panEl.value?.setPointerCapture(e.pointerId)
  }
  tx.value = press.tx + dx
  ty.value = press.ty + dy
}

function onPointerUp(e: PointerEvent): void {
  if (!press) return
  const wasClick = !captured
  const { stateId, tid, interactive } = press
  press = null
  if (captured) {
    captured = false
    panning.value = false
    panEl.value?.releasePointerCapture?.(e.pointerId)
    return // 平移：不触发选中
  }
  if (wasClick) {
    if (tid) {
      editor.select('transition', tid)
      return
    }
    if (interactive) return // 官方按钮（发送事件/折叠等）不参与选中
    if (stateId) {
      const s = editor.doc.states.find((x) => x.id === stateId)
      if (s) {
        editor.select('state', s.uid)
        return
      }
    }
    editor.select(null, null) // 空白点击取消选中
  }
}

// ───────────────── 点击选中的匹配函数 ─────────────────

/**
 * 官方渲染契约（集中管理：升级 @tinyactors/scxmljs 时先核对这里）。
 * 依据 0.2.0-dev.0 的 shadow DOM 实测（2026-11 探针）：
 *   转移标签：SPAN[part="transition edge-label"]（非 button！——标签匹配不可被
 *     isInteractiveTarget 短路，否则所有转移的画布点击选中静默失效）
 *     [part="event"] 文本 = 事件名；eventless 显示 defaultViewStrings.eventless（ε）
 *     [part="cond"] 文本 = [cond]（官方约 22 字符截断，尾部 …）
 *     title = "事件 [cond] → 目标id列表"（目标逗号分隔）
 *   状态容器：[data-state] 属性（嵌套容器取最内层）
 * 失效症状：点击标签无反应/取消选中。官方升级后先跑 scripts/check-canvas-select.cjs。
 */
const OFFICIAL = {
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
} as const

/** 真 <button> 等交互元素（穿透 shadow DOM），保持官方语义不参与选中 */
function isInteractiveTarget(e: PointerEvent): boolean {
  return e.composedPath().some((n) => n instanceof HTMLElement && n.matches(OFFICIAL.interactive))
}

/** composedPath 上最内层的 [data-state] 元素（嵌套容器取最内层） */
function stateIdFromEvent(e: PointerEvent): string | null {
  for (const n of e.composedPath()) {
    if (n instanceof HTMLElement && n.hasAttribute(OFFICIAL.stateAttr)) {
      return n.getAttribute(OFFICIAL.stateAttr)
    }
  }
  return null
}

/**
 * 编辑态：点击转移标签 → 匹配文档中的转移并返回其 id。
 *
 * 元素不给标签转移标识（内部 Map 不外露、cond 文本截断），组合三处
 * **未截断/可精确**的信息通常可唯一确定（结构契约见 OFFICIAL 注释）：
 *   1. `[part="event"]` span 集合 = 事件名（精确；eventless 为占位词 ε）
 *   2. title 属性 " → 目标id列表"（精确，逗号分隔）
 *   3. `[part="cond"]` 文本（截断时作前缀匹配）
 * 匹配到多条时取文档顺序第一条；零匹配返回 null（无操作）。
 */
function transitionIdFromLabel(e: PointerEvent): string | null {
  const label = e
    .composedPath()
    .find(
      (n): n is HTMLElement =>
        n instanceof HTMLElement && (n.getAttribute('part') ?? '').split(/\s+/).includes(OFFICIAL.edgeLabelPart),
    )
  if (!label) return null

  const labelEvents = [...label.querySelectorAll(`[part="${OFFICIAL.eventPart}"]`)]
    .map((s) => s.textContent?.trim() ?? '')
    .filter(Boolean)
  const condText = (label.querySelector(`[part="${OFFICIAL.condPart}"]`)?.textContent ?? '').trim()
  const title = label.getAttribute('title') ?? ''
  const arrow = title.lastIndexOf(OFFICIAL.titleArrow)
  const targets = (arrow >= 0 ? title.slice(arrow + 1) : '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return matchTransitionId(editor.doc, {
    events: labelEvents,
    condText,
    targets,
    eventless: OFFICIAL.eventless,
  })
}
</script>

<template>
  <div class="chart-host">
    <div
      ref="panEl"
      class="zoom-pan"
      :class="{ panning }"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div
        class="zoom-inner"
        :style="{
          width: canvasW + 'px',
          height: canvasH + 'px',
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        }"
      >
        <scxml-view
          ref="viewEl"
          class="view"
          :direction="dirName"
          autostart="false"
        ></scxml-view>
      </div>
      <div v-if="explorerOn" class="explorer-host">
        <scxml-explorer ref="explorerEl" @scxml-select="onExplorerSelect"></scxml-explorer>
        <div class="explorer-transitions">
          <div class="explorer-transitions-head">
            <span>{{ editor.labels.explorerTransitions }}</span>
            <span class="sce-count">{{ explorerTransitions.length }}</span>
          </div>
          <div v-if="!explorerState" class="explorer-transitions-empty">{{ editor.labels.explorerNoState }}</div>
          <div v-else-if="!explorerTransitions.length" class="explorer-transitions-empty">{{ editor.labels.explorerNoTransitions }}</div>
          <button
            v-for="t in explorerTransitions"
            :key="t.id"
            class="explorer-transition"
            :class="{ on: editor.selection.kind === 'transition' && editor.selection.id === t.id }"
            @click="selectExplorerTransition(t.id)"
          >
            <span class="ev">{{ t.event || 'ε' }}</span>
            <span v-if="t.cond" class="cond">[{{ t.cond }}]</span>
            <span class="to">→ {{ t.target === null ? editor.labels.internalTransition : editor.stateName(t.target) }}</span>
          </button>
        </div>
      </div>
      <div class="top-right">
        <button
          v-if="editor.features.explorer"
          class="explorer-toggle"
          :class="{ on: explorerOn }"
          @click="toggleExplorer"
        >{{ editor.labels.explorer }}</button>
        <div v-if="editor.doc.states.length > 0" class="dir-switch">
          <button :class="{ on: dirMode === 'down' }" title="纵向布局" @click="dirMode = 'down'">纵向</button>
          <button :class="{ on: dirMode === 'right' }" title="横向布局" @click="dirMode = 'right'">横向</button>
          <button :class="{ on: dirMode === 'auto' }" title="随宽度自动切换（滞回断点 900/1100px）" @click="dirMode = 'auto'">自动</button>
        </div>
      </div>

      <div class="zoom-controls">
        <button title="放大（Ctrl+滚轮）" @click="zoomBy(1.2)">＋</button>
        <button title="缩小（Ctrl+滚轮）" @click="zoomBy(1 / 1.2)">－</button>
        <button title="适应窗口" @click="fitView">⤢</button>
        <button title="复位 1:1（回到原点）" @click="resetView">⌂</button>
      </div>

      <div v-if="editor.doc.states.length === 0" class="empty">
        <p>空文档</p>
        <p class="sub">从左侧结构面板添加状态，或用工具栏打开示例</p>
      </div>
      <div class="sel-meta" aria-live="polite">{{ selectionText }}</div>
    </div>
  </div>
</template>

<style scoped>
.chart-host {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.zoom-pan {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.zoom-pan.panning {
  cursor: grabbing;
}
.zoom-inner {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}
.view {
  width: 100%;
  height: 100%;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
.explorer-host {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: var(--scxml-surface);
}
.explorer-host scxml-explorer {
  display: block;
  width: 100%;
  height: 100%;
}
.explorer-transitions {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 6;
  width: 280px;
  max-height: 42%;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px;
  border: 1px solid var(--scxml-border-2);
  border-radius: 8px;
  background: color-mix(in srgb, var(--scxml-surface) 94%, transparent);
  box-shadow: var(--scxml-shadow, 0 4px 16px rgba(0, 0, 0, 0.18));
}
.explorer-transitions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 4px;
  font: 600 11px var(--scxml-font-sans);
  color: var(--scxml-fg-muted);
}
.explorer-transitions-empty {
  padding: 4px 2px;
  font: 11px var(--scxml-font-sans);
  color: var(--scxml-fg-subtle);
}
.explorer-transition {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--scxml-fg);
  text-align: left;
  font: 11px var(--scxml-font-mono);
  cursor: pointer;
}
.explorer-transition:hover {
  background: var(--scxml-surface-2);
}
.explorer-transition.on {
  border-color: var(--scxml-accent);
  background: var(--scxml-accent-subtle);
}
.explorer-transition .cond { color: var(--scxml-fg-muted); }
.explorer-transition .to {
  margin-left: auto;
  color: var(--scxml-fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.explorer-toggle {
  font: 11px var(--scxml-font-sans);
  padding: 4px 10px;
  border: 1px solid var(--scxml-border-2);
  border-radius: 6px;
  background: var(--scxml-surface);
  color: var(--scxml-fg-muted);
  cursor: pointer;
}
.explorer-toggle.on {
  background: var(--scxml-accent);
  border-color: var(--scxml-accent);
  color: var(--scxml-on-accent);
}

.top-right {
  position: absolute;
  top: 8px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10;
}
.mode-switch {
  display: flex;
  border: 1px solid var(--scxml-border-2);
  border-radius: 6px;
  overflow: hidden;
  background: var(--scxml-surface);
}
.mode-switch button {
  font: 11px var(--scxml-font-sans);
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: var(--scxml-fg-muted);
  cursor: pointer;
}
.mode-switch button.on {
  background: var(--scxml-accent);
  color: var(--scxml-on-accent);
}
.mode-switch button:hover:not(.on) {
  background: var(--scxml-surface-2);
}
.dir-switch {
  display: flex;
  border: 1px solid var(--scxml-border-2);
  border-radius: 6px;
  overflow: hidden;
  background: var(--scxml-surface);
}
.dir-switch button {
  font: 11px var(--scxml-font-sans);
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: var(--scxml-fg-muted);
  cursor: pointer;
}
.dir-switch button.on {
  background: var(--scxml-accent);
  color: var(--scxml-on-accent);
}
.dir-switch button:hover:not(.on) {
  background: var(--scxml-surface-2);
}

.zoom-controls {
  position: absolute;
  top: 46px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 10;
}
.zoom-controls button {
  width: 26px;
  height: 24px;
  font: 13px/1 var(--scxml-font-sans);
  color: var(--scxml-fg);
  background: var(--scxml-surface);
  border: 1px solid var(--scxml-border-2);
  border-radius: 5px;
  cursor: pointer;
}
.zoom-controls button:hover {
  background: var(--scxml-surface-2);
  border-color: var(--scxml-accent);
}

.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  pointer-events: none;
  font: 600 15px var(--scxml-font-sans);
  color: var(--scxml-fg-muted);
}
.empty .sub {
  font: 12px var(--scxml-font-sans);
  font-weight: 400;
  color: var(--scxml-fg-subtle);
}
</style>
