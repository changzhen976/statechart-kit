/**
 * 画布点击选中的纯匹配逻辑（与 DOM 解耦，便于测试）。
 *
 * 官方 `<scxml-view>` 不暴露转移标识；ChartCanvas 从标签的 shadow DOM 读取
 * event / cond / title 目标列表，本函数按文档顺序找出第一条匹配的转移。
 */
import type { ProjectDoc } from '../core/model'

export interface TransitionLabelInfo {
  /** `[part="event"]` 文本列表；eventless 时为空 */
  events: string[]
  /** `[part="cond"]` 文本（含方括号；可能被官方截断） */
  condText: string
  /** title 中 `→` 后的目标 id 列表；无 target 的 chip 为空 */
  targets: string[]
  /** 官方 eventless 占位词（如 ε） */
  eventless: string
}

const TRUNC_MARK = /(…|\.\.\.)$/

/** 返回匹配的 transition id；无匹配返回 null。 */
export function matchTransitionId(doc: ProjectDoc, label: TransitionLabelInfo): string | null {
  const condBody = label.condText.replace(/^\[/, '').replace(/\]$/, '')
  const condTruncated = TRUNC_MARK.test(condBody)
  const condPrefix = condBody.replace(TRUNC_MARK, '').trim()
  const idOf = (uid: string): string | undefined => doc.states.find((s) => s.uid === uid)?.id

  const candidates = doc.transitions.filter((t) => {
    const tEvents = new Set(t.event ? t.event.split(/\s+/) : [label.eventless])
    const lEvents = new Set(label.events.length ? label.events : [label.eventless])
    if (tEvents.size !== lEvents.size || ![...tEvents].every((x) => lEvents.has(x))) return false
    if (t.target === null) {
      // 无 target 的转移在官方渲染里是状态盒内的 chip，title 不含 "→ 目标"
      if (label.targets.length) return false
    } else {
      const tid = idOf(t.target)
      if (!tid || !label.targets.includes(tid)) return false
    }
    if (label.condText) {
      if (condTruncated ? !t.cond.startsWith(condPrefix) : t.cond !== condPrefix) return false
    } else if (t.cond) {
      return false
    }
    return true
  })
  return candidates[0]?.id ?? null
}
