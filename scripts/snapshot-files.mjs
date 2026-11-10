/**
 * P1 快照/基线清单。
 *
 * - `KIT_FILES`：受基线保护的全部源码与验证脚本（freeze/check 共同使用）；
 * - `DONOR_MIRRORED`：仍与 scxml-creator 逐字节一致的搬运文件（`--donor` 时比对）；
 * - `DONOR_DIVERGED`：P1 起有意改写的文件（不再与 donor 比对，理由写清楚）；
 * - `DONOR_EXCLUDED`：刻意不搬的 donor 文件。
 *
 * P0 的「本仓 = donor 同字节」语义只对 `DONOR_MIRRORED` 保留；P1 之后本仓是独立事实源。
 */

/** core 源码（零运行时依赖） */
export const CORE_FILES = [
  'src/core/index.ts',
  'src/core/model.ts',
  'src/core/serializer.ts',
  'src/core/action-parse.ts',
  'src/core/naming-policy.ts',
  'src/core/naming.ts',
  'src/core/migrate.ts',
  'src/core/scxml-import.ts',
  'src/core/examples.ts',
  'src/core/log.ts',
  'src/core/event-catalog.ts',
  'src/core/active-tree.ts',
  'src/core/validate-structure.ts',
  'src/core/cdata.ts',
  'src/core/serialize-checked.ts',
]

/** engine 入口（依赖 @tinyactors/scxmljs） */
export const ENGINE_FILES = [
  'src/engine/index.ts',
  'src/engine/session-runner.ts',
  'src/engine/validator.ts',
  'src/engine/engine-loader.ts',
]

/** 宿主诊断格式化（中文；P4 起 scxml-creator 复用） */
export const DIAGNOSTICS_FILES = ['src/diagnostics/zh.ts']

/** P3 Vue 编辑器（SFC + store + 样式；构建由 Vite 负责） */
export const VUE_FILES = [
  'src/vue/index.ts',
  'src/vue/types.ts',
  'src/vue/features.ts',
  'src/vue/labels.ts',
  'src/vue/format.ts',
  'src/vue/events.ts',
  'src/vue/browser-adapter.ts',
  'src/vue/editor-store.ts',
  'src/vue/use-editor.ts',
  'src/vue/modules.ts',
  'src/vue/shims-vue.d.ts',
  'src/vue/EditorHost.vue',
  'src/vue/Toolbar.vue',
  'src/vue/StructurePanel.vue',
  'src/vue/ChartCanvas.vue',
  'src/vue/PropertyPanel.vue',
  'src/vue/ActionListEditor.vue',
  'src/vue/EventCombo.vue',
  'src/vue/VariablesPanel.vue',
  'src/vue/SimPanel.vue',
  'src/vue/SimBar.vue',
  'src/vue/ValidationDialog.vue',
  'src/vue/ConfirmDialog.vue',
  'src/vue/styles.css',
]

/** 验证脚本 */
export const TEST_FILES = [
  'test/verify-import.ts',
  'test/smoke-engine.ts',
  'test/verify-timers.ts',
  'test/verify-naming.ts',
  'test/verify-events.ts',
  'test/verify-validation.ts',
  'test/verify-engine.ts',
  'test/verify-editor.ts',
  'test/fixtures/server-policy.ts',
]

export const KIT_FILES = [
  ...CORE_FILES,
  ...ENGINE_FILES,
  ...DIAGNOSTICS_FILES,
  ...VUE_FILES,
  ...TEST_FILES,
]

/** 兼容旧脚本命名（P0 时即此清单） */
export const SNAPSHOT_FILES = KIT_FILES

/** 仍与 donor 逐字节一致的搬运文件 */
export const DONOR_MIRRORED = [
  { file: 'src/core/model.ts', donor: 'src/core/model.ts', ref: '6b5cfb6' },
  { file: 'src/core/serializer.ts', donor: 'src/core/serializer.ts', ref: '6b5cfb6' },
  { file: 'src/core/examples.ts', donor: 'src/core/examples.ts', ref: '6b5cfb6' },
  { file: 'test/smoke-engine.ts', donor: 'scripts/smoke-engine.ts', ref: 'edd8558' },
  { file: 'test/verify-timers.ts', donor: 'scripts/verify-timers.ts', ref: 'edd8558' },
]

/** P1/P2 有意改写的文件：保留在本仓，但不要求与 donor 同字节 */
export const DONOR_DIVERGED = [
  {
    file: 'src/core/index.ts',
    reason: 'P1/P2 导出面：命名策略/迁移/事件目录/激活树/结构校验/严格序列化',
  },
  {
    file: 'src/core/action-parse.ts',
    reason: '动作类型 label 改为消息 code（由宿主本地化）',
  },
  {
    file: 'src/core/naming.ts',
    reason: '重写为 NamingPolicy 驱动；服务端前缀与迁移逻辑移到宿主策略',
  },
  {
    file: 'src/core/scxml-import.ts',
    reason: '导入 warnings/errors 改为 { code, params }',
  },
  {
    file: 'src/core/log.ts',
    reason: '截断提示不再内置中文字符串',
  },
  {
    file: 'src/engine/index.ts',
    reason: '新增引擎层校验与懒加载器导出',
  },
  {
    file: 'src/engine/session-runner.ts',
    reason: 'P2：引擎选择/选项/data 预置、generation 生命周期、监听器隔离、结构化变量写入',
  },
  {
    file: 'test/verify-import.ts',
    reason: 'warnings 类型改为 ImportWarning[]（行为断言不变）',
  },
  { file: 'src/core/naming-policy.ts', reason: 'P1 新增：命名策略类型 + BASE_POLICY' },
  { file: 'src/core/migrate.ts', reason: 'P1 新增：策略驱动的迁移骨架' },
  { file: 'src/core/event-catalog.ts', reason: 'P1 新增：本地事件目录（从 donor events.ts 拆出）' },
  { file: 'src/core/active-tree.ts', reason: 'P1 新增：激活状态层级树（从 donor events.ts 拆出）' },
  { file: 'src/core/validate-structure.ts', reason: 'P1 新增：零依赖结构校验' },
  { file: 'src/engine/validator.ts', reason: 'P1 新增：引擎层校验 + validateDocument 分层' },
  { file: 'test/verify-naming.ts', reason: 'P1 新增：命名策略测试' },
  { file: 'test/verify-events.ts', reason: 'P1 新增：事件目录/激活树测试' },
  { file: 'test/verify-validation.ts', reason: 'P1 新增：校验分层测试' },
  { file: 'src/core/cdata.ts', reason: 'P2 新增：CDATA 中和（导入/校验/建会话共用）' },
  { file: 'src/core/serialize-checked.ts', reason: 'P2 新增：严格序列化 + DocumentStructureError' },
  { file: 'src/engine/engine-loader.ts', reason: 'P2 新增：统一引擎懒加载器' },
  { file: 'test/verify-engine.ts', reason: 'P2 新增：引擎选项/生命周期测试' },
  { file: 'src/vue/**', reason: 'P3 新增：可嵌入 Vue 编辑器（EditorHost/features/mountEditor/样式）' },
  { file: 'src/diagnostics/zh.ts', reason: 'P4 新增：诊断 code 中文格式化（宿主共用）' },
  { file: 'test/verify-editor.ts', reason: 'P3 新增：编辑器 store 测试' },
]

/**
 * 刻意不进入本仓的 donor 文件。理由写清楚，避免后来者以为是漏搬。
 */
export const DONOR_EXCLUDED = [
  {
    file: 'src/core/validator.ts',
    reason: 'P1 已拆分：结构校验 → src/core/validate-structure.ts，引擎校验 → src/engine/validator.ts；donor 文件本身不再直接搬运',
  },
  {
    file: 'src/core/events.ts',
    reason: 'P1 已拆分：本地事件目录/激活树 → src/core/event-catalog.ts、active-tree.ts；时钟/路由/MQTT 来源与展示文案留宿主',
  },
  {
    file: 'src/stores/project.ts',
    reason: 'P3 已在 statechart-kit/vue 重写为 adapter 驱动的 editor-store；donor 文件留到 P4 对照删除',
  },
  {
    file: 'src/core/audit.ts',
    reason: '服务端审计（跨机孤儿引用），属宿主能力',
  },
  {
    file: 'src/core/storage.ts',
    reason: 'localStorage / 文件导入导出，属浏览器宿主能力',
  },
  {
    file: 'src/stores/*.ts',
    reason: 'Pinia 应用状态；P3 随编辑器一并迁移',
  },
  {
    file: 'src/components/* src/panels/* src/viewhost/*',
    reason: 'Vue 编辑器 UI；P3 迁移',
  },
]
