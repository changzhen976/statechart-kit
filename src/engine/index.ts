/**
 * statechart-kit — engine
 *
 * SCXML 会话封装：创建 / 运行 / 回放控制 / 事件注入 / 变量快照 / 销毁。
 * 依赖 `@tinyactors/scxmljs`；浏览器与 Node 均可运行（Node 需注入 domParser）。
 *
 * P0 状态：scxml-creator 的逐字快照（见 docs/baseline.json）。
 */
export * from './session-runner'
