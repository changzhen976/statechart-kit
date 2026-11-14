import type { ProjectDoc, TransitionEdge } from './model'

export const INTERNAL_EVENT_GUARD = "_event.type === 'internal'"

/** 旧 SCXML 的 external 守卫（只用于导入降级，不再生成）。 */
const LEGACY_EXTERNAL_GUARD = "_event.type === 'external'"

/** 给用户 cond 追加 internal 守卫；空 cond 只返回守卫。 */
export function withInternalGuard(cond: string): string {
  const user = cond.trim()
  return user ? `(${user}) && (${INTERNAL_EVENT_GUARD})` : INTERNAL_EVENT_GUARD
}

function stripGuard(cond: string, guard: string): string {
  const value = cond.trim()
  if (value === guard) return ''
  const suffix = ` && (${guard})`
  if (!value.endsWith(suffix)) return value
  let user = value.slice(0, -suffix.length).trim()
  if (user.startsWith('(') && user.endsWith(')')) user = user.slice(1, -1).trim()
  return user
}

/** 识别并剥离 kit 生成的守卫；external 只为导入旧 SCXML。 */
export function stripVisibilityGuard(cond: string): {
  cond: string
  visibility?: 'internal' | 'external'
} {
  const internal = stripGuard(cond, INTERNAL_EVENT_GUARD)
  if (internal !== cond.trim()) return { cond: internal, visibility: 'internal' }
  const external = stripGuard(cond, LEGACY_EXTERNAL_GUARD)
  if (external !== cond.trim()) return { cond: external, visibility: 'external' }
  return { cond: cond.trim() }
}

function eventNamesOf(t: TransitionEdge): string[] {
  return t.event.split(/\s+/).filter(Boolean)
}

/** 仅内部事件名；去重、排序。 */
export function internalOnlyNames(doc: ProjectDoc): string[] {
  const names = new Set<string>()
  for (const raw of doc.internalOnlyEvents ?? []) {
    const name = raw.trim()
    if (name) names.add(name)
  }
  return [...names].sort()
}

export function isInternalOnlyEvent(doc: ProjectDoc, event: string): boolean {
  const name = event.trim()
  return !!name && (doc.internalOnlyEvents?.includes(name) ?? false)
}

/** 设置/取消“仅内部”；数组保持去重、排序。 */
export function setInternalOnlyEvent(doc: ProjectDoc, event: string, on: boolean): void {
  const name = event.trim()
  if (!name) return
  const next = new Set(doc.internalOnlyEvents ?? [])
  if (on) next.add(name)
  else next.delete(name)
  if (next.size) doc.internalOnlyEvents = [...next].sort()
  else delete doc.internalOnlyEvents
}

/**
 * 转移的统一可见性：自动延时转移永远不加守卫；所有事件名都是仅内部时返回
 * `'internal'`，否则 null（混合事件由结构校验报 error）。
 */
export function transitionVisibility(doc: ProjectDoc, t: TransitionEdge): 'internal' | null {
  if (t.delayMs !== undefined) return null
  const names = eventNamesOf(t)
  if (!names.length) return null
  return names.every((name) => isInternalOnlyEvent(doc, name)) ? 'internal' : null
}
