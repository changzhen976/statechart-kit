/**
 * 诊断 code → 中文文本（仅编辑器展示层；core/engine 仍只返回 code+params）。
 * 宿主可用自己的 i18n 替换这些函数，或直接显示 code。
 */
import type { ImportWarning } from '../core/scxml-import'
import type { NamingIssue } from '../core/naming'
import type { StructureIssue } from '../core/validate-structure'
import type { ValidationIssue } from '../engine/validator'
import type { VariableWriteResult } from '../engine/session-runner'

export type Params = Record<string, unknown>

function value(params: Params | undefined, key: string): string {
  const v = params?.[key]
  if (v === undefined || v === null) return '?'
  return typeof v === 'string' ? v : JSON.stringify(v)
}

/** `{name}` 占位替换 */
export function template(text: string, params?: Params): string {
  return text.replace(/\{(\w+)\}/g, (_m, k: string) => value(params, k))
}

const NAMING: Record<string, string> = {
  'naming.empty': '名称为空',
  'naming.auto-delay': '「{name}」是内部延迟事件名（自动生成），不能手动输入',
  'naming.legacy-prefix': '「{name}」使用已废弃的 {prefix} 前缀，请迁移到当前命名空间',
  'naming.prefix.not-for-event': '「{name}」的 {prefix} 是 {namespace} 命名空间，不能用作事件名',
  'naming.prefix.not-for-variable': '「{name}」的 {prefix} 是 {namespace} 命名空间，不能用作变量名',
  'naming.prefix.warn': '「{name}」使用 {prefix} 前缀：{hint}',
  'naming.send.reserved': '不能手动发送「{name}」：{prefix} 由宿主注入',
  'naming.assign.forbidden': '不能 assign 到「{name}」：{prefix} 为保留命名空间',
  'naming.transition.legacy': '转移事件「{name}」使用已废弃的 {prefix} 前缀',
}

const STRUCTURE: Record<string, string> = {
  'structure.state.missing-uid': '状态「{id}」缺少内部 uid',
  'structure.state.duplicate-uid': '状态「{id}」的 uid「{uid}」重复',
  'structure.state.missing-id': '状态 uid「{uid}」缺少 SCXML id',
  'structure.state.invalid-id': '状态 id「{id}」非法（须以字母/下划线开头）',
  'structure.state.duplicate-id': '状态 id「{id}」重复',
  'structure.state.self-parent': '状态「{id}」不能以自身为父',
  'structure.state.missing-parent': '状态「{id}」的父状态「{parent}」不存在',
  'structure.state.parent-cycle': '状态「{id}」的父子关系成环',
  'structure.state.history-root': '历史伪态「{id}」必须有父状态',
  'structure.state.history-children': '历史伪态「{id}」不能有子状态',
  'structure.state.history-actions': '历史伪态「{id}」的 entry/exit 动作会被忽略',
  'structure.state.final-children': '终态「{id}」不能有子状态',
  'structure.state.final-transition': '终态「{id}」不能有 {count} 条出边',
  'structure.state.atomic-children': '原子状态「{id}」不能有子状态',
  'structure.state.compound-empty': '组合状态「{id}」没有子状态',
  'structure.state.parallel-initial': '并行状态「{id}」的 initial 会被忽略',
  'structure.state.initial-ignored': '状态「{id}」不是组合状态，initial 会被忽略',
  'structure.state.initial-fallback': '组合状态「{id}」未指定 initial，将使用第一个子状态',
  'structure.state.initial-missing': '状态「{id}」的 initial「{initial}」不存在',
  'structure.state.initial-not-child': '状态「{id}」的 initial「{initial}」不是直接子状态',
  'structure.state.initial-history': '状态「{id}」的 initial 指向历史伪态，将被忽略',
  'structure.state.donedata-not-final': '状态「{id}」（{kind}）不能有完成数据：donedata 只属于终态',
  'structure.state.donedata-empty': '状态「{id}」的完成数据为空',
  'structure.state.donedata-ambiguous': '状态「{id}」的完成数据同时使用了多种形式：content / expr / param 只能选一种',
  'structure.state.donedata-param-invalid': '状态「{id}」的第 {index} 个 donedata param 缺少 name 或 expr',
  'structure.state.donedata-param-duplicate': '状态「{id}」的 donedata param 名称「{name}」重复',
  'structure.root.initial-missing': '根 initial「{initial}」不存在',
  'structure.root.initial-not-top': '根 initial「{initial}」不是顶层状态',
  'structure.variable.missing-id': '第 {index} 个变量缺少 id',
  'structure.variable.invalid-id': '变量 id「{id}」非法',
  'structure.variable.duplicate-id': '变量 id「{id}」重复',
  'structure.transition.missing-source': '转移「{id}」的源状态不存在',
  'structure.transition.missing-target': '转移「{id}」的目标状态不存在',
  'structure.transition.history-targetless': '历史伪态「{id}」的默认转移必须有目标状态',
  'structure.transition.internal-eventless': '内部转移「{id}」没有事件，可能形成自激循环',
  'structure.transition.delay-invalid': '转移「{id}」的 delayMs 非法（需 ≥ 10）',
  'structure.transition.delay-without-event': '转移「{id}」有延时但没有事件名',
  'structure.transition.mixed-event-visibility': '转移「{id}」的事件列表混合了仅内部/仅外部/双向事件（{events}），可见性守卫不会生成',
  'structure.event.internal-only-with-external-producer': '事件「{event}」被设为仅内部，但存在外部生产者（{channel}）',
  'structure.event.internal-only-without-producer': '事件「{event}」被设为仅内部，但没有任何生产者',
  'structure.action.internal-delay-unsupported': '事件「{event}」使用 send target="#_internal" + delay：当前引擎会丢弃该事件',
}

const VALIDATION: Record<string, string> = {
  'validation.engine.problem': '引擎结构错误：{detail}',
  'validation.engine.error': '引擎错误：{detail}',
  'validation.script-action': '自定义 JS（{slot} 第 {index} 行）：{line}',
}

const VARIABLE: Record<string, string> = {
  'variable.session-not-running': '会话未运行',
  'variable.unknown': '未知变量「{id}」',
  'variable.assign-failed': '写入「{id}」失败：{detail}',
  'variable.assign-expr': '已赋值 {id} = {expr}',
  'variable.assign-value': '已写入 {id}',
}

function fromMap(map: Record<string, string>, code: string, params?: Params): string | null {
  const text = map[code]
  return text ? template(text, params) : null
}

export function formatNamingIssue(issue: NamingIssue): string {
  return fromMap(NAMING, issue.code, issue.params) ?? `${issue.code} ${JSON.stringify(issue.params)}`
}

export function formatStructureIssue(issue: StructureIssue): string {
  return (
    fromMap(STRUCTURE, issue.code, issue.params) ??
    fromMap(NAMING, issue.code, issue.params) ??
    `${issue.code} ${JSON.stringify(issue.params ?? {})}`
  )
}

export function formatValidationIssue(issue: ValidationIssue): string {
  return (
    fromMap(VALIDATION, issue.code, issue.params) ??
    fromMap(STRUCTURE, issue.code, issue.params) ??
    fromMap(NAMING, issue.code, issue.params) ??
    `${issue.code} ${JSON.stringify(issue.params)}`
  )
}

export function formatImportWarning(warning: ImportWarning): string {
  // 导入警告只做开发期展示；宿主可用 code 自行本地化
  return `${warning.code} ${JSON.stringify(warning.params)}`
}

export function formatVariableResult(result: VariableWriteResult): string {
  return fromMap(VARIABLE, result.code, result.params) ?? result.code
}
