/**
 * 编辑器事件候选（展示层）：core 的结构化事件目录 + 宿主外部来源 → 分组下拉项。
 * 分组/标签属于展示文案，留在 Vue 层，不进入 core。
 */
import type { ExternalEventSource } from '../core/event-catalog'
import { buildDirectionCatalog, docEventFacts } from '../core/event-catalog'
import type { ProjectDoc } from '../core/model'
import type { NamingPolicy } from '../core/naming-policy'
import type { EditorLabels } from './labels'

export type EditorEventGroup = 'in' | 'out' | 'lone'

export interface EditorEventOption {
  value: string
  group: EditorEventGroup
  /** 行尾补充（来源/广播/延时） */
  tag?: string
  /** 悬浮提示 */
  tip?: string
}

/**
 * 文档发出/监听 + 外部来源 → 分组候选（编辑器下拉）。
 * 自动延迟事件始终出现在“本机发出”，并标注延时。
 */
export function buildEditorEventOptions(
  doc: ProjectDoc,
  policy: NamingPolicy,
  ext: ExternalEventSource[] = [],
  labels: Pick<EditorLabels, 'eventTagDelay' | 'eventTagBroadcast' | 'eventTipLone'> = {
    eventTagDelay: '⏱ 延时 {ms}ms',
    eventTagBroadcast: '广播',
    eventTipLone: '仅被监听：没有任何 send/外部来源会发出它',
  },
): EditorEventOption[] {
  const facts = docEventFacts(doc)
  const cat = buildDirectionCatalog(policy, facts.sends, facts.listens, ext, {
    includeUnlistenedExt: true,
  })
  const delayOf = (event: string): number | undefined =>
    doc.transitions.find((t) => t.delayMs !== undefined && t.event === event)?.delayMs

  const options: EditorEventOption[] = []
  for (const r of cat.in) {
    options.push({
      value: r.value,
      group: 'in',
      ...(r.tag !== undefined ? { tag: r.tag } : {}),
      ...(r.tip !== undefined ? { tip: r.tip } : {}),
    })
  }
  for (const r of cat.out) {
    const ms = delayOf(r.value)
    options.push({
      value: r.value,
      group: 'out',
      ...(ms !== undefined
        ? { tag: labels.eventTagDelay.replace('{ms}', String(ms)) }
        : r.broadcast
          ? { tag: labels.eventTagBroadcast }
          : {}),
    })
  }
  for (const r of cat.lone) {
    options.push({ value: r.value, group: 'lone', tip: labels.eventTipLone })
  }
  return options
}

/** 只取事件名（datalist 用） */
export function editorEventValues(options: EditorEventOption[]): string[] {
  return [...new Set(options.map((o) => o.value))].sort((a, b) => a.localeCompare(b))
}
