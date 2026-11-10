/**
 * P0 快照清单：哪些文件逐字取自 scxml-creator，哪些刻意留在应用侧。
 * freeze/check 两个脚本共用此清单，避免两处漂移。
 */

/** 逐字快照：core（零运行时依赖的那一部分） */
export const CORE_FILES = [
  'src/core/model.ts',
  'src/core/serializer.ts',
  'src/core/action-parse.ts',
  'src/core/naming.ts',
  'src/core/scxml-import.ts',
  'src/core/examples.ts',
  'src/core/log.ts',
]

/** 逐字快照：engine */
export const ENGINE_FILES = ['src/engine/session-runner.ts']

/** 逐字快照：从 donor scripts/ 搬到 test/ 的纯逻辑验证 */
export const TEST_FILES = [
  'test/verify-import.ts',
  'test/smoke-engine.ts',
  'test/verify-timers.ts',
]

export const SNAPSHOT_FILES = [...CORE_FILES, ...ENGINE_FILES, ...TEST_FILES]

/**
 * 刻意不进入 P0 快照的 donor 文件。理由写清楚，避免后来者以为是漏搬。
 */
export const DONOR_EXCLUDED = [
  {
    file: 'src/core/validator.ts',
    reason: '静态依赖 @tinyactors/scxmljs/trusted；P1 拆成「结构校验进 core」「引擎校验进 engine」',
  },
  {
    file: 'src/core/events.ts',
    reason: '含 MQTT/时钟/路由等宿主概念；P1 拆成「本地事件目录进 core」「外部来源留宿主」',
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
