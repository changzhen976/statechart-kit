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

/**
 * 仅内部事件名（0.15 事实源）。
 *
 * 过渡期（P1）同时合并 legacy `eventVisibility` 的 internal 项；P3 删除 legacy 后
 * 这里只看 `internalOnlyEvents`。返回去重、排序后的新数组。
 */
export function internalOnlyNames(doc: ProjectDoc): string[] {
  const names = new Set<string>()
  for (const raw of doc.internalOnlyEvents ?? []) {
    const name = raw.trim()
    if (name) names.add(name)
  }
  for (const [rawName, visibility] of Object.entries(doc.eventVisibility ?? {})) {
    const name = rawName.trim()
    if (name && visibility === 'internal') names.add(name)
  }
  return [...names].sort()
}

export function isInternalOnlyEvent(doc: ProjectDoc, event: string): boolean {
  const name = event.trim()
  if (!name) return false
  if (doc.internalOnlyEvents?.includes(name)) return true
  // P1 过渡：旧文档/旧调用方仍可能只写 legacy 映射。
  return doc.eventVisibility?.[name] === 'internal'
}

/**
 * 设置/取消“仅内部”。P1 过渡期同时维护 legacy `eventVisibility`，
 * 保证旧事件面板与旧调用方仍能读到；P3 删除 legacy 双写。
 */
export function setInternalOnlyEvent(doc: ProjectDoc, event: string, on: boolean): void {
  const name = event.trim()
  if (!name) return
  const next = new Set(doc.internalOnlyEvents ?? [])
  // 合并旧映射里已有的 internal，避免切换时丢配置。
  for (const [oldName, visibility] of Object.entries(doc.eventVisibility ?? {})) {
    if (visibility === 'internal') next.add(oldName.trim())
  }
  if (on) next.add(name)
  else next.delete(name)
  if (next.size) doc.internalOnlyEvents = [...next].filter(Boolean).sort()
  else delete doc.internalOnlyEvents

  if (on) {
    doc.eventVisibility = { ...(doc.eventVisibility ?? {}), [name]: 'internal' }
    return
  }
  if (doc.eventVisibility?.[name] === 'internal') {
    const legacy = { ...doc.eventVisibility }
    delete legacy[name]
    if (Object.keys(legacy).length) doc.eventVisibility = legacy
    else delete doc.eventVisibility
  }
}

export function isExternalOnlyEvent(doc: ProjectDoc, event: string): boolean {
  return doc.eventVisibility?.[event] === 'external'
}

/**
 * 转移的统一可见性：
 * - 自动延时转移永远 external，返回 null（不生成守卫，避免破坏定时转移）；
 * - 所有事件名都是同一非 both 可见性时才返回该值；
 * - 混合可见性返回 null，由结构校验给出 error。
 */
export function transitionVisibility(doc: ProjectDoc, t: TransitionEdge): EventVisibility | null {
  if (t.delayMs !== undefined) return null
  const names = eventNamesOf(t)
  if (!names.length) return null
  const values = names.map((name) =>
    isInternalOnlyEvent(doc, name)
      ? 'internal'
      : doc.eventVisibility?.[name] === 'external'
        ? 'external'
        : 'both',
  )
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

/**
 * 旧 API（0.14）：internal 走新字段，external 保留 legacy 映射。
 * 0.15 的 UI 改用 `setInternalOnlyEvent`；P3 删除本函数。
 */
export function setEventVisibility(doc: ProjectDoc, event: string, visibility: EventVisibility): void {
  const name = event.trim()
  if (!name) return
  if (visibility === 'internal') {
    setInternalOnlyEvent(doc, name, true)
    return
  }
  setInternalOnlyEvent(doc, name, false)
  if (visibility === 'external') {
    doc.eventVisibility = { ...(doc.eventVisibility ?? {}), [name]: 'external' }
    return
  }
  // both：移除 legacy external（internal 已由上面的 false 清掉）
  if (doc.eventVisibility?.[name] === 'external') {
    const legacy = { ...doc.eventVisibility }
    delete legacy[name]
    if (Object.keys(legacy).length) doc.eventVisibility = legacy
    else delete doc.eventVisibility
  }
}
