/**
 * 「仅内部」弹窗的扫描逻辑（Vue 展示层，纯函数）。
 *
 * 生产者判定复用 core 的 `docEventFacts`（raise / #_internal = internal，
 * 普通 send / send delay = external，delayMs 自动事件 = auto-delay）；
 * 监听者判定复用 `isInternalOnlyEvent`，与序列化/校验保持同一语义。
 */
import type { ProjectDoc } from '../core/model'
import { docEventFacts } from '../core/event-catalog'
import type { EventChannel } from '../core/event-catalog'
import { isInternalOnlyEvent } from '../core/event-visibility'
import { parseActionLine } from '../core/action-parse'

export type InternalOnlyProducerReason = 'external' | 'auto-delay' | 'internal-delay'

export interface InternalOnlyProducer {
  /** 稳定 id，用于「改为内部发送」定位 */
  id: string
  kind: 'state-action' | 'transition-action' | 'auto-delay'
  channel: EventChannel
  /** 显示来源（状态名 / 源→目标 / 自动延时） */
  source: string
  stateUid?: string
  stateId?: string
  transitionId?: string
  slot?: 'entry' | 'exit' | 'transition'
  actionIndex?: number
  line?: string
  conflict: boolean
  reason?: InternalOnlyProducerReason
  canFix: boolean
}

export interface InternalOnlyListener {
  transitionId: string
  source: string
  target: string
  events: string[]
  mixed: boolean
}

export interface InternalOnlyScan {
  event: string
  producers: InternalOnlyProducer[]
  listeners: InternalOnlyListener[]
  conflicts: number
  canConfirm: boolean
}

export interface InternalEventDialogState {
  event: string
  scan: InternalOnlyScan
}

function labelOf(doc: ProjectDoc, uid: string): string {
  const s = doc.states.find((x) => x.uid === uid)
  return s ? s.label || s.id : uid
}

/** 扫描一个事件是否满足「仅内部」的生产端/消费端约束（不改文档）。 */
export function scanInternalOnly(doc: ProjectDoc, event: string): InternalOnlyScan {
  const name = event.trim()
  const facts = docEventFacts(doc)
  const origins = facts.sendOrigins.get(name) ?? []
  const producers: InternalOnlyProducer[] = origins.map((origin) => {
    if (origin.kind === 'auto-delay') {
      return {
        id: `auto:${origin.transitionId}`,
        kind: 'auto-delay',
        channel: 'auto-delay',
        source: `${origin.source.label} → ${origin.target?.label ?? ''}`,
        transitionId: origin.transitionId,
        conflict: true,
        reason: 'auto-delay',
        canFix: false,
      }
    }
    const parsed = parseActionLine(origin.line ?? '')
    const internalDelay =
      parsed.type === 'send' && parsed.target === '#_internal' && !!parsed.delay
    const external = origin.channel !== 'internal'
    const canFix =
      external &&
      !internalDelay &&
      parsed.type === 'send' &&
      parsed.target === undefined &&
      !parsed.delay
    const source =
      origin.kind === 'state-action'
        ? origin.state.label
        : `${origin.source.label} → ${origin.target?.label ?? ''}`
    return {
      id:
        origin.kind === 'state-action'
          ? `state:${origin.state.uid}:${origin.slot}:${origin.actionIndex ?? 0}`
          : `transition:${origin.transitionId}:${origin.actionIndex ?? 0}`,
      kind: origin.kind,
      channel: origin.channel,
      source,
      ...(origin.kind === 'state-action'
        ? { stateUid: origin.state.uid, stateId: origin.state.id, slot: origin.slot }
        : { transitionId: origin.transitionId, slot: 'transition' as const }),
      ...(origin.actionIndex !== undefined ? { actionIndex: origin.actionIndex } : {}),
      ...(origin.line !== undefined ? { line: origin.line } : {}),
      conflict: external || internalDelay,
      ...(internalDelay
        ? { reason: 'internal-delay' as const }
        : external
          ? { reason: 'external' as const }
          : {}),
      canFix,
    }
  })

  const listeners: InternalOnlyListener[] = []
  for (const edge of facts.listenEdges.get(name) ?? []) {
    const t = doc.transitions.find((x) => x.id === edge.transitionId)
    if (!t) continue
    const events = t.event.split(/\s+/).filter(Boolean)
    const mixed = events.length > 1 && events.some((e) => e !== name && !isInternalOnlyEvent(doc, e))
    listeners.push({
      transitionId: t.id,
      source: labelOf(doc, t.source),
      target: t.target === null ? '' : labelOf(doc, t.target),
      events,
      mixed,
    })
  }

  const conflicts =
    producers.filter((p) => p.conflict).length + listeners.filter((l) => l.mixed).length
  return { event: name, producers, listeners, conflicts, canConfirm: conflicts === 0 }
}
