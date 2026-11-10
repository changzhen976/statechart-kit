/**
 * 编辑器能力开关（P3）。
 *
 * `EditorHost` 只渲染被打开的功能；宿主（scxml-creator / Node-RED）可按场景裁剪，
 * 例如 Node-RED 只需要表单 + 画布，不需要示例/部署/退出。
 */
export interface EditorFeatures {
  /** 顶部工具栏 */
  toolbar: boolean
  /** 左栏结构编辑 */
  structure: boolean
  /** 中间 scxml-view 画布 */
  canvas: boolean
  /** 右栏属性面板 */
  properties: boolean
  /** 结构化动作编辑器（false = textarea 降级） */
  structuredActions: boolean
  /** 右栏变量面板 */
  variables: boolean
  /** 右栏仿真面板 */
  simulation: boolean
  /** 底部仿真控制条 */
  simBar: boolean
  /** 校验按钮/弹窗 */
  validation: boolean
  /** 新建/打开/保存/导出 */
  importExport: boolean
  /** 内置示例下拉 */
  examples: boolean
  /** 撤销/重做 */
  undoRedo: boolean
  /** 宿主部署按钮（adapter.deploy） */
  deploy: boolean
  /** 退出编辑按钮（adapter.exit） */
  exit: boolean
}

export const DEFAULT_FEATURES: EditorFeatures = {
  toolbar: true,
  structure: true,
  canvas: true,
  properties: true,
  structuredActions: true,
  variables: true,
  simulation: true,
  simBar: true,
  validation: true,
  importExport: true,
  examples: true,
  undoRedo: true,
  deploy: false,
  exit: false,
}

export function resolveFeatures(partial?: Partial<EditorFeatures>): EditorFeatures {
  return { ...DEFAULT_FEATURES, ...(partial ?? {}) }
}
