/**
 * statechart-kit — core
 *
 * 状态图文档模型、SCXML 序列化/导入、命名策略、事件目录、结构校验、日志条目类型。
 * 零运行时依赖：不引入引擎、Vue、网络或浏览器存储。
 *
 * 边界：本包**生成** SCXML，不解释 SCXML。解释器是 `@tinyactors/scxmljs`。
 *
 * P1 状态：
 * - 命名服务端语义已外置为 `NamingPolicy`，core 只提供 `BASE_POLICY`；
 *   服务端兼容预设在 `statechart-kit/policies/server`。
 * - 校验分层：本入口的 `validateStructure` 纯结构；引擎层在 `statechart-kit/engine`。
 * - 诊断返回 `{ code, params }`，不返回中文文案，由宿主本地化。
 */
export * from './model'
export * from './serializer'
export * from './action-parse'
export * from './naming-policy'
export * from './naming'
export * from './migrate'
export * from './scxml-import'
export * from './log'
export * from './event-catalog'
export * from './active-tree'
export * from './validate-structure'
export * from './serialize-checked'
