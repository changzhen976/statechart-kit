/**
 * statechart-kit — engine
 *
 * SCXML 会话封装：创建 / 运行 / 回放控制 / 事件注入 / 变量快照 / 销毁；
 * 引擎层校验：`validateScxml` / `validateAgainstEngine` / `validateDocument`。
 * 依赖 `@tinyactors/scxmljs`；浏览器与 Node 均可运行（Node 需注入 domParser）。
 */
export * from './session-runner'
export * from './validator'
