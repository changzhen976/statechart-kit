/**
 * statechart-kit — core
 *
 * 状态图文档模型、SCXML 序列化/导入、命名规则、日志条目类型。
 * 零运行时依赖：不引入引擎、Vue、网络或浏览器存储。
 *
 * 边界：本包**生成** SCXML，不解释 SCXML。解释器是 `@tinyactors/scxmljs`。
 *
 * P0 状态：以下模块为 scxml-creator 的逐字快照（见 docs/baseline.json）。
 * 命名策略的服务端语义（gv_/mqe_/t_/sys.）尚未外置，P1 会拆成可注入策略。
 */
export * from './model'
export * from './serializer'
export * from './action-parse'
export * from './naming'
export * from './scxml-import'
export * from './log'
