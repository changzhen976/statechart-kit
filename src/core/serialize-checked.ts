/**
 * 严格序列化（P2）。
 *
 * `serializeToScxml` 保持 donor 的容忍策略：找不到 parent/端点时会回退或跳过，
 * 便于编辑器在“半成品文档”上实时预览。但如果宿主直接把它交给运行时，非法结构
 * 会被静默写成错误的 SCXML。本模块提供显式的“先校验再序列化”入口：
 *
 *   serializeChecked(doc)  // 结构有 error 时抛 DocumentStructureError
 *
 * 与 `validateStructure` 一样零运行时依赖；默认序列化行为不变。
 */
import type { ProjectDoc } from './model'
import { serializeToScxml } from './serializer'
import { validateStructure, type StructureIssue } from './validate-structure'

/** 结构校验失败（code 固定，issues 带逐条定位；宿主可本地化/展示） */
export class DocumentStructureError extends Error {
  readonly code = 'document.invalid-structure'
  readonly issues: StructureIssue[]

  constructor(issues: StructureIssue[]) {
    // message 仅作开发期兜底；用户可见文案由宿主按 code/issues 生成
    super('document.invalid-structure')
    this.name = 'DocumentStructureError'
    this.issues = issues
  }
}

/**
 * 校验结构后序列化；存在 error 级问题时抛错（warning 不阻断）。
 * 需要容忍半成品文档的编辑器预览仍应直接调用 `serializeToScxml`。
 */
export function serializeChecked(doc: ProjectDoc): string {
  const report = validateStructure(doc)
  if (!report.ok) {
    throw new DocumentStructureError(report.issues.filter((i) => i.severity === 'error'))
  }
  return serializeToScxml(doc)
}
