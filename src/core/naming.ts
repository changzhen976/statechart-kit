/**
 * 命名规则（策略驱动）。
 *
 * 具体前缀（`gv_`/`ge_`/`t_`/`mqe_`/`mqv_`/`sys.`）**不在 core 里硬编码**：
 * 宿主传入 `NamingPolicy`，本模块只按策略做最长前缀匹配与允许/拦截/警告判定。
 * 内置预设见 `statechart-kit/policies/server`（`SERVER_POLICY`）。
 *
 * 诊断结果统一为 `{ level, code, params }`，不返回中文文案——消费方按 code 本地化。
 *
 * 与宿主无关的规则保留在这里：
 * - 内部延迟转移事件 `delay<N><s|ms>_<源>_to_<目标>`（工具自动生成）；
 * - v1 → v2 迁移的遍历骨架（具体改名函数由策略提供）。
 */
import { parseActionLine } from './action-parse'
import type { ProjectDoc } from './model'
import {
  matchNamespace,
  type NamingPolicy,
  type NamingSubject,
} from './naming-policy'

/** 内部延迟转移事件（after 语义）：`delay<N>s|ms_<源>_to_<目标>`，工具自动生成——
 *  进入源状态 N（按单位）后触发该转移，离开源状态自动撤销；不可手输/路由/MQTT 规则 */
export const AUTO_DELAY_RE = /^delay\d+(s|ms)_.+/
export const isAutoDelayEvent = (name: string): boolean => AUTO_DELAY_RE.test(name)

/** 命名诊断 code。宿主按 code + params 本地化；新增 code 视为公开 API。 */
export type NamingIssueCode =
  | 'naming.empty'
  | 'naming.auto-delay'
  | 'naming.legacy-prefix'
  | 'naming.prefix.not-for-event'
  | 'naming.prefix.not-for-variable'
  | 'naming.prefix.warn'
  | 'naming.send.reserved'
  | 'naming.assign.forbidden'
  | 'naming.transition.legacy'

export interface NamingIssue {
  level: 'block' | 'warn'
  code: NamingIssueCode | (string & {})
  params: Record<string, string | number>
}

/** 文档级命名诊断的定位信息（宿主据此高亮到具体控件） */
export type NamingTarget =
  | { kind: 'datamodel'; index: number; name: string }
  | {
      kind: 'state'
      stateUid: string
      stateId: string
      stateLabel: string
      slot: 'entry' | 'exit'
      actionIndex: number
      action: string
    }
  | {
      kind: 'transition'
      transitionId: string
      event: string
      actionIndex?: number
      action?: string
    }

export type DocNamingIssue = NamingIssue & { target: NamingTarget }

export interface EventNameContext {
  /** 传入文档后，已被某转移以 delayMs 引用的自动名放行（下拉可选） */
  doc?: ProjectDoc
  /**
   * `name`（默认）= 新建/重命名输入，执行全部规则；
   * `listen` = 已有转移的事件属性，只拦截 legacy 前缀（监听保留字事件合法）。
   */
  mode?: 'name' | 'listen'
}

/** 事件名校验：空名、自动延迟事件引用、策略前缀。 */
export function checkEventName(
  policy: NamingPolicy,
  name: string,
  ctx: EventNameContext = {},
): NamingIssue | null {
  if (!name.trim()) {
    return { level: 'block', code: 'naming.empty', params: { subject: 'event' } }
  }
  const ns = matchNamespace(policy, name)
  if (ctx.mode === 'listen') {
    // 监听 t_/sys. 事件合法；只拦 v1 遗留前缀（与部署闸门的判断一致）
    return ns?.legacy
      ? {
          level: 'block',
          code: 'naming.legacy-prefix',
          params: { name, prefix: ns.prefix, namespace: ns.key },
        }
      : null
  }
  if (policy.autoDelayEvents !== false && isAutoDelayEvent(name)) {
    const exists = !!ctx.doc?.transitions.some((t) => t.delayMs !== undefined && t.event === name)
    return exists
      ? null
      : { level: 'block', code: 'naming.auto-delay', params: { name } }
  }
  if (!ns) return null
  if (ns.legacy) {
    return {
      level: 'block',
      code: 'naming.legacy-prefix',
      params: { name, prefix: ns.prefix, namespace: ns.key },
    }
  }
  return dispositionIssue(ns, name, 'event')
}

/** 变量名校验：空名 + 策略前缀（`warn` 级用于「须绑机器」这类提示）。 */
export function checkVarName(policy: NamingPolicy, name: string): NamingIssue | null {
  if (!name.trim()) {
    return { level: 'block', code: 'naming.empty', params: { subject: 'variable' } }
  }
  const ns = matchNamespace(policy, name)
  if (!ns) return null
  if (ns.legacy) {
    return {
      level: 'block',
      code: 'naming.legacy-prefix',
      params: { name, prefix: ns.prefix, namespace: ns.key },
    }
  }
  return dispositionIssue(ns, name, 'variable')
}

function dispositionIssue(
  ns: NamingPolicy['namespaces'][number],
  name: string,
  subject: NamingSubject,
): NamingIssue | null {
  const disposition = ns[subject]
  if (disposition === 'allow') return null
  const params: Record<string, string | number> = {
    name,
    prefix: ns.prefix,
    namespace: ns.key,
  }
  if (ns.hint) params.hint = ns.hint
  if (disposition === 'warn') {
    return { level: 'warn', code: ns.warnCode ?? 'naming.prefix.warn', params }
  }
  return {
    level: 'block',
    code: subject === 'event' ? 'naming.prefix.not-for-event' : 'naming.prefix.not-for-variable',
    params,
  }
}

/** 该事件是否按策略视为「广播给所有运行中机器」 */
export function isBroadcastEvent(policy: NamingPolicy, name: string): boolean {
  return matchNamespace(policy, name)?.broadcast === true
}

/** 宿主事件路由是否应拒绝该事件（广播/时钟/系统/遗留/内部延迟） */
export function isReservedRouteEvent(policy: NamingPolicy, name: string): boolean {
  const ns = matchNamespace(policy, name)
  return (
    isAutoDelayEvent(name) ||
    ns?.legacy === true ||
    ns?.routeReserved === true
  )
}

/** 名称是否落在指定命名空间（宿主做细粒度判断用） */
export function isInNamespace(
  policy: NamingPolicy,
  name: string,
  namespaceKey: string,
): boolean {
  const ns = matchNamespace(policy, name)
  return ns?.key === namespaceKey
}

/**
 * 部署/保存闸门：返回第一条违规（含定位）；null = 合规。
 *
 * 与交互式命名校验的区别（保持 scxml-creator 既有行为）：
 * - 监听 `t_`/`sys.` 事件合法，只有手动 `send` 才拦；
 * - `send` 只拦策略标记了 `sendBlocked` 的命名空间；
 * - `assign` 只拦策略标记了 `assignBlocked` 的命名空间；
 * - datamodel 变量做完整变量名校验（warning 不算阻断）。
 */
export function checkDocNaming(policy: NamingPolicy, doc: ProjectDoc): DocNamingIssue | null {
  for (let i = 0; i < doc.datamodel.length; i++) {
    const d = doc.datamodel[i]!
    const issue = checkVarName(policy, d.id)
    if (issue?.level === 'block') {
      return { ...issue, target: { kind: 'datamodel', index: i, name: d.id } }
    }
  }

  const scanActions = (
    actions: string[],
    targetOf: (actionIndex: number, action: string) => NamingTarget,
  ): DocNamingIssue | null => {
    for (let i = 0; i < actions.length; i++) {
      const line = actions[i]!
      const a = parseActionLine(line)
      if (a.type === 'send') {
        const ns = matchNamespace(policy, a.event)
        if (ns?.sendBlocked) {
          return {
            level: 'block',
            code: 'naming.send.reserved',
            params: {
              name: a.event,
              prefix: ns.prefix,
              namespace: ns.key,
            },
            target: targetOf(i, line),
          }
        }
      }
      if (a.type === 'assign') {
        const ns = matchNamespace(policy, a.target)
        if (ns?.assignBlocked) {
          return {
            level: 'block',
            code: 'naming.assign.forbidden',
            params: {
              name: a.target,
              prefix: ns.prefix,
              namespace: ns.key,
            },
            target: targetOf(i, line),
          }
        }
      }
    }
    return null
  }

  for (const s of doc.states) {
    const stateTarget = (slot: 'entry' | 'exit') => (i: number, action: string): NamingTarget => ({
      kind: 'state',
      stateUid: s.uid,
      stateId: s.id,
      stateLabel: s.label || s.id,
      slot,
      actionIndex: i,
      action,
    })
    const entryIssue = scanActions(s.entryActions, stateTarget('entry'))
    if (entryIssue) return entryIssue
    const exitIssue = scanActions(s.exitActions, stateTarget('exit'))
    if (exitIssue) return exitIssue
  }

  for (const t of doc.transitions) {
    const eventNs = matchNamespace(policy, t.event)
    if (eventNs?.legacy) {
      return {
        level: 'block',
        code: 'naming.transition.legacy',
        params: { name: t.event, prefix: eventNs.prefix, namespace: eventNs.key },
        target: { kind: 'transition', transitionId: t.id, event: t.event },
      }
    }
    const actionIssue = scanActions(t.actions, (i, action) => ({
      kind: 'transition',
      transitionId: t.id,
      event: t.event,
      actionIndex: i,
      action,
    }))
    if (actionIssue) return actionIssue
  }
  return null
}
