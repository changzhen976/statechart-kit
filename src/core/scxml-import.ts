/**
 * SCXML 导入逆向（README 路线图）：SCXML 文本 → ProjectDoc。
 * 与 serializer.ts 对偶——**自产 SCXML 可无损往返**（verify-import 对全部内置示例
 * 断言 serialize → import → serialize 逐字节相等）。
 *
 * 外部 SCXML 支持：state/parallel/final/history（含嵌套）、initial 属性与
 * <initial> 子元素、onentry/onexit、transition(event/target/cond)、
 * 动作 send(含 <content> 文本/@expr/delay/id)、cancel、assign、log、
 * script（CDATA）、raise（等价 send）、datamodel/data。
 *
 * 不支持（收集 warnings 后跳过，不中断导入）：if/elseif/else/foreach、
 * donedata、invoke、targetless 转移、多 initial（取第一个）。
 *
 * 标签（label）默认取 SCXML id——标准 SCXML 不含显示名，导入后在编辑器改名即可。
 */
import type { MetaAttrs, ProjectDoc, StateNode, TransitionEdge, StateKind } from './model'
import { emptyDoc, newTransitionId, newUid, normalizeDoc, uniqueStateId } from './model'
import { isAutoDelayEvent } from './naming'
import { actionToLine, type ActionStruct } from './action-parse'
import { neutralizeCdata } from './cdata'

/** 导入诊断的定位（语言无关）：状态 id + 可选动作槽位 */
export interface ImportLocation {
  stateId: string
  slot?: 'entry' | 'exit' | 'transition'
}

/**
 * 导入降级说明。只返回 `{ code, params }`，宿主本地化；定位参数 `at` 是
 * `ImportLocation`（状态 id + 槽位），不是拼好的中文句子。
 */
export interface ImportWarning {
  code: string
  params: Record<string, unknown>
}

export interface ScxmlImportResult {
  doc: ProjectDoc
  /** 不支持结构的降级说明（已跳过的动作/转移等） */
  warnings: ImportWarning[]
}

/** 导入失败（解析错误 / 根元素不对）；`code` + `params` 供宿主本地化 */
export class ScxmlImportError extends Error {
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(code: string, params: Record<string, unknown> = {}) {
    // 不把中文文案写进 core；message 仅作开发期兜底
    super(code)
    this.name = 'ScxmlImportError'
    this.code = code
    this.params = params
  }
}

interface Ctx {
  doc: ProjectDoc
  warnings: ImportWarning[]
  /** SCXML 状态 id → doc uid */
  idToUid: Map<string, string>
  /** 转移元素延后解析（两遍法：先建全部状态 uid，再解析转移 target） */
  pendingTransitions: { el: Element; sourceUid: string; at: ImportLocation }[]
  /** 状态 uid → onentry/onexit 原始动作行（内部延迟转移折叠用） */
  rawByUid: Map<string, { entry: string[]; exit: string[] }>
}

function warn(
  ctx: Ctx,
  code: string,
  params: Record<string, unknown> = {},
): void {
  ctx.warnings.push({ code, params })
}

const STATE_TAGS: Record<string, StateKind> = {
  state: 'atomic',
  parallel: 'parallel',
  final: 'final',
  history: 'history',
}

/** 可执行内容子元素 → DSL 行；不支持返回 null（并记 warning） */
function actionElToLine(el: Element, at: ImportLocation, ctx: Ctx): string | null {
  const tag = el.tagName.toLowerCase()
  let a: ActionStruct | null = null
  switch (tag) {
    case 'send':
    case 'raise': {
      const event = el.getAttribute('event') ?? ''
      if (!event) {
        warn(ctx, 'import.action.missing-event', { at, tag })
        return null
      }
      const s: ActionStruct = { type: 'send', event }
      const delay = el.getAttribute('delay')
      if (delay) s.delay = delay
      const id = el.getAttribute('id')
      if (id) s.id = id
      // targetexpr/target、type 等外部寻址属性不支持——外部 SCXML 提示
      if (el.getAttribute('target') || el.getAttribute('targetexpr')) {
        warn(ctx, 'import.send.external-target', { at, tag, event })
      }
      const content = el.getElementsByTagName('content')[0]
      if (content) {
        const expr = content.getAttribute('expr')
        if (expr) {
          s.dataExpr = expr
        } else {
          const text = content.textContent ?? ''
          try {
            s.data = JSON.parse(text)
          } catch {
            s.dataExpr = text.trim()
          }
        }
      }
      // <param> 不支持
      if (el.getElementsByTagName('param').length) {
        warn(ctx, 'import.send.params-ignored', { at, tag, event })
      }
      a = s
      break
    }
    case 'cancel': {
      const sendid = el.getAttribute('sendid') ?? ''
      if (!sendid) {
        warn(ctx, 'import.action.missing-sendid', { at })
        return null
      }
      a = { type: 'cancel', sendid }
      break
    }
    case 'assign': {
      const location = el.getAttribute('location') ?? ''
      if (!location) {
        warn(ctx, 'import.action.missing-location', { at })
        return null
      }
      a = { type: 'assign', target: location, expr: el.getAttribute('expr') ?? '' }
      break
    }
    case 'log': {
      a = { type: 'log', expr: el.getAttribute('expr') ?? '' }
      break
    }
    case 'script': {
      a = { type: 'script', code: (el.textContent ?? '').trim() }
      break
    }
    case 'if':
    case 'elseif':
    case 'else':
    case 'foreach': {
      warn(ctx, 'import.action.unsupported', { at, tag })
      return null
    }
    default: {
      warn(ctx, 'import.action.unknown', { at, tag })
      return null
    }
  }
  return actionToLine(a)
}

/** onentry/onexit/transition 容器内的可执行子元素 → DSL 行数组 */
function actionsFromContainer(container: Element, at: ImportLocation, ctx: Ctx): string[] {
  const lines: string[] = []
  for (const child of Array.from(container.children)) {
    const line = actionElToLine(child, at, ctx)
    if (line !== null) lines.push(line)
  }
  return lines
}

/** 状态元素（state/parallel/final/history）→ [自身, ...全部后代]（扁平，先根后子） */
function statesFromEl(
  el: Element,
  tag: string,
  parentUid: string | null,
  ctx: Ctx,
): StateNode[] {
  const kind: StateKind = STATE_TAGS[tag] ?? 'atomic'
  const scxmlId = el.getAttribute('id') ?? ''
  const uid = newUid()
  let id = scxmlId
  if (!id) {
    id = uniqueStateId(ctx.doc, kind === 'final' ? 'done' : kind === 'history' ? 'hist' : 'imported')
    warn(ctx, 'import.state.missing-id', { id })
  } else if (ctx.idToUid.has(id)) {
    const renamed = uniqueStateId(ctx.doc, id)
    warn(ctx, 'import.state.duplicate-id', { id, renamed })
    id = renamed
  }
  ctx.idToUid.set(id, uid)

  const node: StateNode = {
    uid,
    id,
    label: id,
    // <state> 的 kind 先置 atomic；建完子状态后若有子 → compound
    kind,
    parent: parentUid,
    initial: null,
    ...(tag === 'history' ? { historyType: (el.getAttribute('type') as 'shallow' | 'deep') || 'shallow' } : {}),
    entryActions: [],
    exitActions: [],
  }

  const at: ImportLocation = { stateId: id }
  const childStates: Element[] = []
  let initialId: string | null = null
  const rawEntry: string[] = []
  const rawExit: string[] = []
  for (const child of Array.from(el.children)) {
    const ctag = child.tagName.toLowerCase()
    if (ctag === 'onentry') {
      rawEntry.push(...actionsFromContainer(child, { ...at, slot: 'entry' }, ctx))
    } else if (ctag === 'onexit') {
      rawExit.push(...actionsFromContainer(child, { ...at, slot: 'exit' }, ctx))
    } else if (ctag === 'transition') {
      ctx.pendingTransitions.push({ el: child, sourceUid: uid, at: { ...at, slot: 'transition' } })
    } else if (ctag === 'initial') {
      // <initial><target id="x"/></initial> 子元素形式
      const target = child.getElementsByTagName('target')[0]?.getAttribute('id') ?? null
      if (target) initialId = target
    } else if (STATE_TAGS[ctag]) {
      childStates.push(child)
    } else if (ctag === 'donedata' || ctag === 'invoke') {
      warn(ctx, 'import.element.unsupported', { at, tag: ctag })
    }
  }
  // 原始行登记：内部延迟转移折叠在转移解析后统一进行（需源状态上下文）
  ctx.rawByUid.set(uid, { entry: rawEntry, exit: rawExit })

  // 子状态递归（扁平收集，先建全部 uid，initial 才能解析）；<state> 有子 = compound
  const kidNodes = childStates.flatMap((c) => statesFromEl(c, c.tagName.toLowerCase(), uid, ctx))
  if (kind === 'atomic' && kidNodes.length) node.kind = 'compound'

  // initial：属性（可空格分隔多个，取第一个）优先，其次 <initial> 子元素
  const initialAttr = el.getAttribute('initial')
  if (initialAttr) initialId = initialAttr.split(/\s+/)[0]!
  if (initialId) {
    const targetUid = ctx.idToUid.get(initialId) ?? null
    if (targetUid && kidNodes.some((s) => s.uid === targetUid)) {
      node.initial = targetUid
    } else if (targetUid) {
      warn(ctx, 'import.initial.not-child', { at, initial: initialId })
    } else {
      warn(ctx, 'import.initial.missing-target', { at, initial: initialId })
    }
  }
  return [node, ...kidNodes]
}

function transitionFromEl(
  el: Element,
  sourceUid: string,
  at: ImportLocation,
  ctx: Ctx,
): TransitionEdge | null {
  const targetId = el.getAttribute('target')
  if (!targetId) {
    warn(ctx, 'import.transition.no-target', {
      at,
      event: el.getAttribute('event') ?? '',
    })
    return null
  }
  // 多 target（fork 语义）取第一个
  const first = targetId.split(/\s+/)[0]!
  if (targetId.includes(' ')) {
    warn(ctx, 'import.transition.multi-target', { at, target: targetId, taken: first })
  }
  const targetUid = ctx.idToUid.get(first)
  if (!targetUid) {
    warn(ctx, 'import.transition.missing-target', { at, target: first })
    return null
  }
  return {
    id: newTransitionId(),
    source: sourceUid,
    target: targetUid,
    event: el.getAttribute('event') ?? '',
    cond: el.getAttribute('cond') ?? '',
    actions: actionsFromContainer(el, at, ctx),
  }
}

/**
 * SCXML 文本 → ProjectDoc。解析失败抛 Error（含 parsererror 摘要）。
 * domParser：Node 环境注入（happy-dom / linkedom）；浏览器省略（全局 DOMParser）。
 */
export function scxmlToDoc(xml: string, domParser?: DOMParser): ScxmlImportResult {
  // Node/Bun/Deno 没有全局 DOMParser：给结构化错误，而不是 ReferenceError
  const parser =
    domParser ?? (typeof DOMParser !== 'undefined' ? new DOMParser() : null)
  if (!parser) {
    throw new ScxmlImportError('import.no-dom-parser')
  }
  const dom = parser.parseFromString(neutralizeCdata(xml), 'text/xml')
  const perr = dom.getElementsByTagName('parsererror')[0]
  if (perr) {
    throw new ScxmlImportError('import.parse-error', {
      detail: (perr.textContent ?? '').trim().slice(0, 200),
    })
  }
  const root = dom.documentElement
  if (root.tagName.toLowerCase() !== 'scxml') {
    throw new ScxmlImportError('import.root-not-scxml', { tag: root.tagName })
  }

  const doc = emptyDoc(root.getAttribute('name') || 'imported')
  const ctx: Ctx = { doc, warnings: [], idToUid: new Map(), pendingTransitions: [], rawByUid: new Map() }

  // 宿主自定义元数据（kit 不解释语义；损坏时忽略并 warning）
  const readAttrs = (el: Element, attr: string, where: string): MetaAttrs | undefined => {
    const raw = el.getAttribute(attr)
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object')
      const out: MetaAttrs = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v
      }
      return Object.keys(out).length ? out : undefined
    } catch {
      warn(ctx, 'import.attrs-invalid', { where, attr })
      return undefined
    }
  }
  const readEventAttrs = (): Record<string, MetaAttrs> | undefined => {
    const raw = root.getAttribute('data-kit-event-attrs')
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object')
      const out: Record<string, MetaAttrs> = {}
      for (const [event, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue
        const attrs: MetaAttrs = {}
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') attrs[k] = v
        }
        if (Object.keys(attrs).length) out[event] = attrs
      }
      return Object.keys(out).length ? out : undefined
    } catch {
      warn(ctx, 'import.attrs-invalid', { where: '根节点', attr: 'data-kit-event-attrs' })
      return undefined
    }
  }
  const rootEventAttrs = readEventAttrs()
  if (rootEventAttrs) ctx.doc.eventAttrs = rootEventAttrs

  // datamodel：<datamodel><data id expr/></datamodel>
  for (const dm of Array.from(root.children)) {
    if (dm.tagName.toLowerCase() === 'datamodel') {
      for (const d of Array.from(dm.children)) {
        if (d.tagName.toLowerCase() === 'data') {
          const id = d.getAttribute('id')
          if (id) {
            const attrs = readAttrs(d, 'data-kit-attrs', `变量 ${id}`)
            ctx.doc.datamodel.push({ id, expr: d.getAttribute('expr') ?? '', ...(attrs ? { attrs } : {}) })
          }
        }
      }
    }
  }

  // 顶层状态
  let rootInitialId: string | null = root.getAttribute('initial')
  const topNodes = []
  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase()
    if (STATE_TAGS[tag]) {
      topNodes.push(...statesFromEl(child, tag, null, ctx))
    } else if (tag === 'initial') {
      rootInitialId = child.getElementsByTagName('target')[0]?.getAttribute('id') ?? rootInitialId
    }
  }
  ctx.doc.states.push(...topNodes)

  // 第二遍：全部状态 uid 就位后解析转移（target 可指向任意状态，含兄弟/后代）
  for (const p of ctx.pendingTransitions) {
    const t = transitionFromEl(p.el, p.sourceUid, p.at, ctx)
    if (t) ctx.doc.transitions.push(t)
  }

  // 第三遍：内部延迟转移折叠（serializer 展开的对偶）——
  //   源状态 entry 的 `send <自动名> delay <N><s|ms> id …` + exit 的 `cancel <自动名>`
  //   → 转移.delayMs/delayUnit 回填，展开行回收；找不到配对 send 的自动名按普通事件保留。
  //   同时回填所有状态的 entry/exit 动作行（rawByUid → node）
  for (const s of ctx.doc.states) {
    const raw = ctx.rawByUid.get(s.uid)
    if (raw) {
      for (const t of ctx.doc.transitions) {
        if (t.delayMs !== undefined || t.source !== s.uid || !isAutoDelayEvent(t.event)) continue
        const re = new RegExp(`^send ${t.event} delay (\\d+)(ms|s)\\b`)
        const idx = raw.entry.findIndex((l) => re.test(l.trim()))
        if (idx < 0) continue
        const m = raw.entry[idx]!.trim().match(/delay\s+(\d+)(ms|s)/)
        if (m) {
          t.delayMs = m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1])
          t.delayUnit = m[2] as 's' | 'ms'
        }
        raw.entry.splice(idx, 1)
        const cIdx = raw.exit.findIndex((l) => l.trim() === `cancel ${t.event}`)
        if (cIdx >= 0) raw.exit.splice(cIdx, 1)
      }
      s.entryActions = raw.entry.filter((l) => !/^cancel delay\d+(ms|s)_/.test(l.trim()))
      s.exitActions = raw.exit.filter((l) => !/^cancel delay\d+(ms|s)_/.test(l.trim()))
    }
  }
  if (rootInitialId) {
    const initAttr = rootInitialId.split(/\s+/)[0]!
    ctx.doc.initial = ctx.idToUid.get(initAttr) ?? null
    if (!ctx.doc.initial) {
      warn(ctx, 'import.root-initial.missing-target', { initial: initAttr })
    }
  }

  return { doc: normalizeDoc(ctx.doc), warnings: ctx.warnings }
}
