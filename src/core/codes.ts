/**
 * 公开诊断 code 目录。
 *
 * 这些数组是宿主做 i18n 覆盖率测试的稳定入口；新增/删除 code 必须同步
 * `docs/messages.md`。它们不替代具体 issue 类型，只提供可枚举的字符串。
 */

export const NAMING_ISSUE_CODES = [
  'naming.empty',
  'naming.auto-delay',
  'naming.legacy-prefix',
  'naming.prefix.not-for-event',
  'naming.prefix.not-for-variable',
  'naming.prefix.warn',
  'naming.send.reserved',
  'naming.assign.forbidden',
  'naming.transition.legacy',
] as const

export const STRUCTURE_ISSUE_CODES = [
  'structure.state.missing-uid',
  'structure.state.duplicate-uid',
  'structure.state.missing-id',
  'structure.state.invalid-id',
  'structure.state.duplicate-id',
  'structure.state.self-parent',
  'structure.state.missing-parent',
  'structure.state.parent-cycle',
  'structure.state.history-root',
  'structure.state.history-children',
  'structure.state.history-actions',
  'structure.state.final-children',
  'structure.state.atomic-children',
  'structure.state.final-transition',
  'structure.state.donedata-not-final',
  'structure.state.donedata-empty',
  'structure.state.donedata-ambiguous',
  'structure.state.donedata-param-invalid',
  'structure.state.donedata-param-duplicate',
  'structure.state.compound-empty',
  'structure.state.parallel-initial',
  'structure.state.initial-ignored',
  'structure.state.initial-fallback',
  'structure.state.initial-missing',
  'structure.state.initial-not-child',
  'structure.state.initial-history',
  'structure.root.initial-missing',
  'structure.root.initial-not-top',
  'structure.variable.missing-id',
  'structure.variable.invalid-id',
  'structure.variable.duplicate-id',
  'structure.transition.missing-id',
  'structure.transition.duplicate-id',
  'structure.transition.missing-source',
  'structure.transition.missing-target',
  'structure.transition.history-targetless',
  'structure.transition.internal-eventless',
  'structure.transition.delay-invalid',
  'structure.transition.delay-without-event',
  'structure.transition.mixed-event-visibility',
  'structure.event.internal-only-with-external-producer',
  'structure.action.internal-delay-unsupported',
] as const

export const IMPORT_WARNING_CODES = [
  'import.action.missing-event',
  'import.send.external-target',
  'import.send.params-ignored',
  'import.action.missing-sendid',
  'import.action.missing-location',
  'import.action.unsupported',
  'import.action.unknown',
  'import.state.missing-id',
  'import.state.duplicate-id',
  'import.element.unsupported',
  'import.donedata.empty-expr',
  'import.donedata.empty-content',
  'import.donedata.param-invalid',
  'import.donedata.ambiguous',
  'import.donedata.unsupported-child',
  'import.initial.not-child',
  'import.initial.missing-target',
  'import.transition.multi-target',
  'import.transition.missing-target',
  'import.transition.type-invalid',
  'import.event-visibility-invalid',
  'import.event-visibility-mismatch',
  'import.event-visibility-external-removed',
  'import.root-initial.missing-target',
  'import.no-dom-parser',
  'import.parse-error',
  'import.root-not-scxml',
] as const

export const VALIDATION_ISSUE_CODES = [
  'validation.engine.problem',
  'validation.engine.error',
  'validation.script-action',
] as const

export const VARIABLE_WRITE_CODES = [
  'variable.assign-expr',
  'variable.assign-value',
  'variable.session-not-running',
  'variable.unknown',
  'variable.assign-failed',
] as const

/** `serializeChecked()` 的 DocumentStructureError.code */
export const DOCUMENT_STRUCTURE_ERROR_CODES = ['document.invalid-structure'] as const
