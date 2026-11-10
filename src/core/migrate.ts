/**
 * 文档迁移骨架（策略驱动）。
 *
 * core 只负责**遍历**文档字段并统计改动；`g_` → `gv_`/`ge_`/`t_`/`sys.` 的具体映射属于
 * 宿主命名语义，由 `NamingPolicy.migration` 提供（见 `statechart-kit/policies/server`）。
 * 没有 `migration` 时所有函数都是恒等变换。
 */
import { parseActionLine } from './action-parse'
import type { ProjectDoc } from './model'
import type { NamingPolicy } from './naming-policy'

/** 事件名迁移（策略缺省 = 原样返回） */
export function migrateEventName(policy: NamingPolicy, name: string): string {
  return policy.migration?.eventName?.(name) ?? name
}

/** 变量名迁移（策略缺省 = 原样返回） */
export function migrateVarName(policy: NamingPolicy, name: string): string {
  return policy.migration?.variableName?.(name) ?? name
}

/** JS 表达式（cond/log/data-expr/script）中的变量引用重写 */
export function migrateExpr(policy: NamingPolicy, expr: string): string {
  return policy.migration?.expression?.(expr) ?? expr
}

/** 动作 DSL 行迁移（只做定点手术，保留其余字节）：send 事件 / assign 变量 / 表达式内容 */
export function migrateActionLine(policy: NamingPolicy, line: string): string {
  const a = parseActionLine(line)
  if (a.type === 'send') {
    let out = line
    const ev = migrateEventName(policy, a.event)
    if (ev !== a.event) out = out.replace(/^send\s+\S+/, `send ${ev}`)
    if (a.dataExpr) {
      const patched = migrateExpr(policy, a.dataExpr)
      if (patched !== a.dataExpr && out.includes(a.dataExpr)) out = out.replace(a.dataExpr, patched)
    }
    return out
  }
  if (a.type === 'assign') {
    return line.replace(
      /^(assign\s+)([\p{L}_$][\p{L}\p{N}_$]*)(\s*=\s*)([\s\S]+)$/u,
      (_m, head: string, target: string, eq: string, expr: string) =>
        `${head}${migrateVarName(policy, target)}${eq}${migrateExpr(policy, expr)}`,
    )
  }
  if (a.type === 'log') {
    return line.replace(/^log\s+([\s\S]+)$/, (_m, expr: string) => `log ${migrateExpr(policy, expr)}`)
  }
  if (a.type === 'script') {
    return migrateExpr(policy, line)
  }
  return line
}

export interface MigrateResult {
  doc: ProjectDoc
  /** 实际发生改写的字段数（报告用） */
  changes: number
}

/** 工程文档结构化迁移（draft 与 deployed.docSnapshot 共用；不改动 uid/layout） */
export function migrateDoc(policy: NamingPolicy, input: ProjectDoc): MigrateResult {
  const doc: ProjectDoc = structuredClone(input)
  let changes = 0
  const bump = <T>(before: T, after: T): T => {
    if (after !== before) changes++
    return after
  }
  doc.datamodel = doc.datamodel.map((d) => ({
    id: bump(d.id, migrateVarName(policy, d.id)),
    expr: bump(d.expr, migrateExpr(policy, d.expr)),
    ...(d.attrs ? { attrs: structuredClone(d.attrs) } : {}),
  }))
  doc.eventAttrs = structuredClone(doc.eventAttrs ?? {})
  for (const s of doc.states) {
    s.entryActions = s.entryActions.map((l) => bump(l, migrateActionLine(policy, l)))
    s.exitActions = s.exitActions.map((l) => bump(l, migrateActionLine(policy, l)))
  }
  for (const t of doc.transitions) {
    t.event = bump(t.event, migrateEventName(policy, t.event))
    t.cond = bump(t.cond, migrateExpr(policy, t.cond))
    t.actions = t.actions.map((l) => bump(l, migrateActionLine(policy, l)))
  }
  return { doc, changes }
}
