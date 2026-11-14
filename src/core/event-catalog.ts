/**
 * 本地事件目录（core）。
 *
 * 从 `scxml-creator/src/core/events.ts` 中拆出的**与宿主无关**部分：
 * - 扫描文档得到事件事实（发出/监听/发出位置/监听转移）；
 * - 合成三方向目录（送入本机 / 本机发出 / 仅监听）；
 * - 收集文档内全部事件名。
 *
 * 刻意留在宿主的部分：时钟 / 事件路由 / MQTT 等外部来源的抓取与过滤、
 * 展示文案（分组标题、来源小字、悬浮提示）。core 只返回结构化数据与 `{code}`
 * 语义（如 `broadcast` 标记），由宿主本地化。
 */
import type { ProjectDoc } from './model'
import { parseActionLine } from './action-parse'
import type { NamingPolicy } from './naming-policy'
import { isBroadcastEvent } from './naming'

/** 状态引用（事件事实中的端点） */
export interface StateRef {
  uid: string
  /** SCXML id */
  id: string
  /** 显示名（label 为空时回退 id） */
  label: string
}

export type EventChannel = 'internal' | 'external' | 'auto-delay'

/** 一条发出位置 */
export type EventOrigin =
  | {
      kind: 'state-action'
      channel: EventChannel
      state: StateRef
      slot: 'entry' | 'exit'
      /** 1 起的动作行号（用于校验定位） */
      actionIndex?: number
      /** 原始动作行 */
      line?: string
    }
  | {
      kind: 'transition-action'
      channel: EventChannel
      transitionId: string
      event: string
      source: StateRef
      /** null = 无 target 的内部转移 */
      target: StateRef | null
      /** 1 起的动作行号（用于校验定位） */
      actionIndex?: number
      /** 原始动作行 */
      line?: string
    }
  | {
      /** 内部延迟转移：entry 的延时 send 由序列化器自动注入 */
      kind: 'auto-delay'
      channel: 'auto-delay'
      transitionId: string
      event: string
      source: StateRef
      target: StateRef | null
      delayMs: number
    }

/** 一条监听边 */
export interface ListenEdge {
  transitionId: string
  source: StateRef
  /** null = 无 target 的内部转移 */
  target: StateRef | null
}

/** 文档事件事实：事件 → 发出位置 / 监听转移（编辑器下拉、属性面板、详情页共用） */
export interface DocEventFacts {
  /** 发出事件集合（send 动作） */
  sends: Set<string>
  /** 监听事件集合（转移 event 属性） */
  listens: Set<string>
  /** 事件 → 发出位置 */
  sendOrigins: Map<string, EventOrigin[]>
  /** 事件 → 监听该事件的转移 */
  listenEdges: Map<string, ListenEdge[]>
}

function stateRefs(doc: ProjectDoc): Map<string, StateRef> {
  const map = new Map<string, StateRef>()
  for (const s of doc.states) {
    map.set(s.uid, { uid: s.uid, id: s.id, label: s.label || s.id })
  }
  return map
}

/** 扫描文档，产出事件事实（发出位置精确到状态上下文与转移端点） */
export function docEventFacts(doc: ProjectDoc): DocEventFacts {
  const refs = stateRefs(doc)
  const ref = (uid: string): StateRef => refs.get(uid) ?? { uid, id: uid, label: uid }
  const refOrNull = (uid: string | null): StateRef | null => (uid === null ? null : ref(uid))
  const facts: DocEventFacts = {
    sends: new Set(),
    listens: new Set(),
    sendOrigins: new Map(),
    listenEdges: new Map(),
  }
  const addSend = (event: string, origin: EventOrigin): void => {
    facts.sends.add(event)
    const list = facts.sendOrigins.get(event) ?? []
    const dup =
      origin.kind === 'auto-delay'
        ? list.some((o) => o.kind === 'auto-delay' && o.transitionId === origin.transitionId)
        : origin.kind === 'state-action'
          ? list.some(
              (o) =>
                o.kind === 'state-action' &&
                o.state.uid === origin.state.uid &&
                o.slot === origin.slot &&
                o.channel === origin.channel,
            )
          : list.some(
              (o) =>
              o.kind === 'transition-action' &&
              o.transitionId === origin.transitionId &&
              o.channel === origin.channel,
            )
    if (!dup) list.push(origin)
    facts.sendOrigins.set(event, list)
  }
  const scan = (
    actions: string[],
    originOf: (event: string, channel: EventChannel, actionIndex: number, line: string) => EventOrigin,
  ): void => {
    actions.forEach((line, index) => {
      const a = parseActionLine(line)
      if ((a.type === 'send' || a.type === 'raise') && a.event) {
        const channel =
          a.type === 'raise' || (a.type === 'send' && a.target === '#_internal')
            ? 'internal'
            : 'external'
        addSend(a.event, originOf(a.event, channel, index + 1, line))
      }
    })
  }

  for (const t of doc.transitions) {
    // 一条转移可以监听多个空格分隔的事件；目录按事件名拆分，而不是整体字符串。
    for (const name of t.event.split(/\s+/).filter(Boolean)) {
      facts.listens.add(name)
      const list = facts.listenEdges.get(name) ?? []
      if (!list.some((e) => e.transitionId === t.id)) {
        list.push({ transitionId: t.id, source: ref(t.source), target: refOrNull(t.target) })
      }
      facts.listenEdges.set(name, list)
    }
  }
  for (const s of doc.states) {
    const state = ref(s.uid)
    scan(s.entryActions, (_event, channel, actionIndex, line) => ({
      kind: 'state-action',
      channel,
      state,
      slot: 'entry',
      actionIndex,
      line,
    }))
    scan(s.exitActions, (_event, channel, actionIndex, line) => ({
      kind: 'state-action',
      channel,
      state,
      slot: 'exit',
      actionIndex,
      line,
    }))
  }
  for (const t of doc.transitions) {
    if (t.actions.length) {
      scan(t.actions, (event, channel, actionIndex, line) => ({
        kind: 'transition-action',
        channel,
        transitionId: t.id,
        event,
        source: ref(t.source),
        target: refOrNull(t.target),
        actionIndex,
        line,
      }))
    }
    // 内部延迟转移（after 语义）：entry 的延时 send 由序列化器自动注入——来源标注
    if (t.delayMs !== undefined && t.event) {
      addSend(t.event, {
        kind: 'auto-delay',
        channel: 'auto-delay',
        transitionId: t.id,
        event: t.event,
        source: ref(t.source),
        target: refOrNull(t.target),
        delayMs: t.delayMs,
      })
    }
  }
  return facts
}

/** 一条外部来源（时钟/路由/MQTT 入向）解析后的候选 */
export interface ExternalEventSource {
  value: string
  /** 来源描述小字；同事件多来源时由调用方预先合并 */
  tag?: string
  /** 来源详情（悬浮提示） */
  tip?: string
}

/** 方向目录的一行；`broadcast` 由策略判定，宿主负责渲染文案 */
export interface DirectionRow {
  value: string
  tag?: string
  tip?: string
  broadcast?: boolean
}

/** 三方向目录（语义分组，不含展示文案） */
export interface DirectionCatalog {
  /** 送入本机（被监听且有外部来源；includeUnlistenedExt 时放宽为全部外部来源） */
  in: DirectionRow[]
  /** 本机发出（send 动作；broadcast=true 表示策略判定为广播事件） */
  out: DirectionRow[]
  /** 仅监听·暂无来源（不会触发） */
  lone: DirectionRow[]
}

/**
 * 合成方向目录。sends/listens 为事件名集合，ext 为外部来源候选（已按目标机器过滤）。
 * - 编辑器下拉：includeUnlistenedExt=true（候选是"可选清单"，未监听的时钟/路由也要展示）
 * - 详情页事件卡：includeUnlistenedExt=false（观察视角，只列本机真正会收到的事件）
 */
export function buildDirectionCatalog(
  policy: NamingPolicy,
  sends: Iterable<string>,
  listens: Iterable<string>,
  ext: Iterable<ExternalEventSource>,
  opts?: { includeUnlistenedExt?: boolean },
): DirectionCatalog {
  const sendSet = new Set(sends)
  const listenSet = new Set(listens)
  const inRows: DirectionRow[] = []
  for (const src of ext) {
    if (!src.value) continue
    if (!opts?.includeUnlistenedExt && !listenSet.has(src.value)) continue
    inRows.push({
      value: src.value,
      ...(src.tag !== undefined ? { tag: src.tag } : {}),
      ...(src.tip !== undefined ? { tip: src.tip } : {}),
    })
  }
  const outRows: DirectionRow[] = [...sendSet]
    .filter(Boolean)
    .map((value) => ({
      value,
      ...(isBroadcastEvent(policy, value) ? { broadcast: true } : {}),
    }))
  const loneRows: DirectionRow[] = [...listenSet]
    .filter((value) => value && !sendSet.has(value) && !inRows.some((r) => r.value === value))
    .map((value) => ({ value }))
  const byValue = (a: DirectionRow, b: DirectionRow): number => a.value.localeCompare(b.value)
  inRows.sort(byValue)
  outRows.sort(byValue)
  loneRows.sort(byValue)
  return { in: inRows, out: outRows, lone: loneRows }
}

/** 由 `delayMs` 转移自动产生的定时器事件名（来源判定，不依赖事件名正则）。 */
export function autoDelayEventNames(doc: ProjectDoc): Set<string> {
  const names = new Set<string>()
  for (const t of doc.transitions) {
    if (t.delayMs !== undefined && t.event) names.add(t.event)
  }
  return names
}

/** 收集文档内出现过的全部事件名（转移 + send 动作），按名称排序 */
export function collectDocEvents(doc: ProjectDoc): string[] {
  const names = new Set<string>()
  const scan = (actions: string[]): void => {
    for (const line of actions) {
      const a = parseActionLine(line)
      if ((a.type === 'send' || a.type === 'raise') && a.event) names.add(a.event)
    }
  }
  for (const t of doc.transitions) {
    for (const name of t.event.split(/\s+/).filter(Boolean)) names.add(name)
  }
  for (const s of doc.states) {
    scan(s.entryActions)
    scan(s.exitActions)
  }
  for (const t of doc.transitions) scan(t.actions)
  return [...names].sort((a, b) => a.localeCompare(b))
}
