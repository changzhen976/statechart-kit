import type { EventVisibility, ProjectDoc, TransitionEdge } from './model'

/** SCXML 标准事件类型守卫；internal 事件由 raise / send target="#_internal" 产生。 */
export const INTERNAL_EVENT_GUARD = "_event.type === 'internal'"

export function withInternalGuard(cond: string): string {
  const user = cond.trim()
  return user ? `(${user}) && (${INTERNAL_EVENT_GUARD})` : INTERNAL_EVENT_GUARD
}

/** 剥离 kit 生成的 internal 守卫；只处理完全匹配的后缀，避免误改用户条件。 */
export function stripInternalGuard(cond: string): string {
  const value = cond.trim()
  if (value === INTERNAL_EVENT_GUARD) return ''
  const suffix = ` && (${INTERNAL_EVENT_GUARD})`
  if (!value.endsWith(suffix)) return value
  let user = value.slice(0, -suffix.length).trim()
  if (user.startsWith('(') && user.endsWith(')')) user = user.slice(1, -1).trim()
  return user
}

export function eventNamesOf(t: TransitionEdge): string[] {
  return t.event.split(/\s+/).filter(Boolean)
}

export function isInternalOnlyEvent(doc: ProjectDoc, event: string): boolean {
  return doc.eventVisibility?.[event] === 'internal'
}

/** 只有全部事件名都 internal 且不是自动延时转移时才加守卫。 */
export function isInternalOnlyTransition(doc: ProjectDoc, t: TransitionEdge): boolean {
  if (t.delayMs !== undefined) return false
  const names = eventNamesOf(t)
  return names.length > 0 && names.every((name) => isInternalOnlyEvent(doc, name))
}

export function setEventVisibility(doc: ProjectDoc, event: string, visibility: EventVisibility): void {
  const name = event.trim()
  if (!name) return
  const next = { ...(doc.eventVisibility ?? {}) }
  if (visibility === 'internal') next[name] = 'internal'
  else delete next[name]
  if (Object.keys(next).length) doc.eventVisibility = next
  else delete doc.eventVisibility
}
