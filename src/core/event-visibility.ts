import type { EventVisibility, ProjectDoc, TransitionEdge } from './model'

export const INTERNAL_EVENT_GUARD = "_event.type === 'internal'"
export const EXTERNAL_EVENT_GUARD = "_event.type === 'external'"

const GUARDS: Record<Exclude<EventVisibility, 'both'>, string> = {
  internal: INTERNAL_EVENT_GUARD,
  external: EXTERNAL_EVENT_GUARD,
}

export function withVisibilityGuard(cond: string, visibility: Exclude<EventVisibility, 'both'>): string {
  const user = cond.trim()
  const guard = GUARDS[visibility]
  return user ? `(${user}) && (${guard})` : guard
}

/** 向后兼容的 internal 简化入口。 */
export function withInternalGuard(cond: string): string {
  return withVisibilityGuard(cond, 'internal')
}

function stripGuard(cond: string, visibility: Exclude<EventVisibility, 'both'>): string {
  const value = cond.trim()
  const guard = GUARDS[visibility]
  if (value === guard) return ''
  const suffix = ` && (${guard})`
  if (!value.endsWith(suffix)) return value
  let user = value.slice(0, -suffix.length).trim()
  if (user.startsWith('(') && user.endsWith(')')) user = user.slice(1, -1).trim()
  return user
}

/** 只剥离指定可见性的守卫；另一种守卫原样保留。 */
export function stripInternalGuard(cond: string): string {
  return stripGuard(cond, 'internal')
}

export function stripExternalGuard(cond: string): string {
  return stripGuard(cond, 'external')
}

/** 识别并剥离 kit 生成的 internal / external 守卫。 */
export function stripVisibilityGuard(cond: string): {
  cond: string
  visibility?: Exclude<EventVisibility, 'both'>
} {
  for (const visibility of ['internal', 'external'] as const) {
    const stripped = stripGuard(cond, visibility)
    if (stripped !== cond.trim()) return { cond: stripped, visibility }
  }
  return { cond: cond.trim() }
}

export function eventNamesOf(t: TransitionEdge): string[] {
  return t.event.split(/\s+/).filter(Boolean)
}

export function isInternalOnlyEvent(doc: ProjectDoc, event: string): boolean {
  return doc.eventVisibility?.[event] === 'internal'
}

export function isExternalOnlyEvent(doc: ProjectDoc, event: string): boolean {
  return doc.eventVisibility?.[event] === 'external'
}

/**
 * 转移的统一可见性：
 * - 自动延时转移永远 external，返回 null（不生成守卫，避免破坏定时转移）；
 * - 所有事件名都是同一非 both 可见性时才返回该值；
 * - 混合可见性返回 null，由结构校验给出 warning。
 */
export function transitionVisibility(doc: ProjectDoc, t: TransitionEdge): EventVisibility | null {
  if (t.delayMs !== undefined) return null
  const names = eventNamesOf(t)
  if (!names.length) return null
  const values = names.map((name) => doc.eventVisibility?.[name] ?? 'both')
  const first = values[0]
  if (first === 'both' || !values.every((v) => v === first)) return null
  return first
}

export function isInternalOnlyTransition(doc: ProjectDoc, t: TransitionEdge): boolean {
  return transitionVisibility(doc, t) === 'internal'
}

export function isExternalOnlyTransition(doc: ProjectDoc, t: TransitionEdge): boolean {
  return transitionVisibility(doc, t) === 'external'
}

export function setEventVisibility(doc: ProjectDoc, event: string, visibility: EventVisibility): void {
  const name = event.trim()
  if (!name) return
  const next = { ...(doc.eventVisibility ?? {}) }
  if (visibility === 'both') delete next[name]
  else next[name] = visibility
  if (Object.keys(next).length) doc.eventVisibility = next
  else delete doc.eventVisibility
}
