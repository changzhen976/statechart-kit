/**
 * 「仅内部」一致性分析（core，零运行时依赖）。
 *
 * 唯一判定源：生产者通道来自 `docEventFacts`，消费者与 mixed 来自同一事件目录。
 * `validateStructure` 把它映射成诊断 code，编辑器弹窗把它映射成展示文案。
 */
import type { ProjectDoc } from './model'
import { docEventFacts, type EventChannel } from './event-catalog'
import { isInternalOnlyEvent } from './event-visibility'
import { parseActionLine } from './action-parse'

export type InternalOnlyProducerReason = 'external' | 'auto-delay' | 'internal-delay'

export interface InternalOnlyProducer {
  /** 稳定 id，用于「改为内部发送」定位 */
  id: string
  kind: 'state-action' | 'transition-action' | 'auto-delay'
  channel: EventChannel
  stateUid?: string
  stateId?: string
  stateLabel?: string
  transitionId?: string
  transitionSourceUid?: string
  transitionSourceId?: string
  transitionSourceLabel?: string
  transitionTargetLabel?: string
  slot?: 'entry' | 'exit' | 'transition'
  actionIndex?: number
  line?: string
  delayMs?: number
  conflict: boolean
  reason?: InternalOnlyProducerReason
  canFix: boolean
}

export interface InternalOnlyListener {
  transitionId: string
  sourceUid: string
  sourceLabel: string
  targetUid: string | null
  targetLabel: string | null
  events: string[]
  mixed: boolean
}

export interface InternalOnlyAnalysis {
  event: string
  producers: InternalOnlyProducer[]
  listeners: InternalOnlyListener[]
  conflicts: number
  canConfirm: boolean
}

function stateLabel(doc: ProjectDoc, uid: string): string {
  const s = doc.states.find((x) => x.uid === uid)
  return s ? s.label || s.id : uid
}

/** 分析一个事件能否设为「仅内部」；不改文档，供校验与弹窗共用。 */
export function analyzeInternalOnly(doc: ProjectDoc, event: string): InternalOnlyAnalysis {
  const name = event.trim()
  const facts = docEventFacts(doc)
  const producers: InternalOnlyProducer[] = []

  for (const origin of facts.sendOrigins.get(name) ?? []) {
    if (origin.kind === 'auto-delay') {
      producers.push({
        id: `auto:${origin.transitionId}`,
        kind: 'auto-delay',
        channel: 'auto-delay',
        transitionId: origin.transitionId,
        transitionSourceUid: origin.source.uid,
        transitionSourceId: origin.source.id,
        transitionSourceLabel: origin.source.label,
        transitionTargetLabel: origin.target?.label,
        delayMs: origin.delayMs,
        conflict: true,
        reason: 'auto-delay',
        canFix: false,
      })
      continue
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
    const producer: InternalOnlyProducer = {
      id:
        origin.kind === 'state-action'
          ? `state:${origin.state.uid}:${origin.slot}:${origin.actionIndex ?? 0}`
          : `transition:${origin.transitionId}:${origin.actionIndex ?? 0}`,
      kind: origin.kind,
      channel: origin.channel,
      conflict: external || internalDelay,
      canFix,
      ...(internalDelay
        ? { reason: 'internal-delay' as const }
        : external
          ? { reason: 'external' as const }
          : {}),
      ...(origin.line !== undefined ? { line: origin.line } : {}),
      ...(origin.actionIndex !== undefined ? { actionIndex: origin.actionIndex } : {}),
    }
    if (origin.kind === 'state-action') {
      producer.stateUid = origin.state.uid
      producer.stateId = origin.state.id
      producer.stateLabel = origin.state.label
      producer.slot = origin.slot
    } else {
      producer.transitionId = origin.transitionId
      producer.transitionSourceUid = origin.source.uid
      producer.transitionSourceId = origin.source.id
      producer.transitionSourceLabel = origin.source.label
      producer.transitionTargetLabel = origin.target?.label
      producer.slot = 'transition'
    }
    producers.push(producer)
  }

  const listeners: InternalOnlyListener[] = []
  for (const edge of facts.listenEdges.get(name) ?? []) {
    const t = doc.transitions.find((x) => x.id === edge.transitionId)
    if (!t) continue
    const events = t.event.split(/\s+/).filter(Boolean)
    const mixed =
      events.length > 1 &&
      events.some((e) => e !== name && !isInternalOnlyEvent(doc, e))
    listeners.push({
      transitionId: t.id,
      sourceUid: t.source,
      sourceLabel: stateLabel(doc, t.source),
      targetUid: t.target,
      targetLabel: t.target === null ? null : stateLabel(doc, t.target),
      events,
      mixed,
    })
  }

  const conflicts =
    producers.filter((p) => p.conflict).length + listeners.filter((l) => l.mixed).length
  return { event: name, producers, listeners, conflicts, canConfirm: conflicts === 0 }
}
