/**
 * 编辑器默认文案（中文）。宿主可通过 `EditorOptions.labels` 覆盖任意键。
 * P3 只覆盖编辑器 UI 文案；诊断 code 的中文解释在 `format.ts`。
 */
export interface EditorLabels {
  appTitle: string
  projectName: string
  undo: string
  redo: string
  newDoc: string
  open: string
  save: string
  examples: string
  openExample: string
  validate: string
  run: string
  stop: string
  pause: string
  play: string
  step: string
  speed: string
  exportScxml: string
  deploy: string
  deploying: string
  exit: string
  structure: string
  states: string
  transitions: string
  filter: string
  addState: string
  addCompound: string
  addParallel: string
  addFinal: string
  addHistory: string
  delete: string
  noStates: string
  noTransitions: string
  addTransition: string
  source: string
  target: string
  event: string
  eventHint: string
  delay: string
  delayMs: string
  delayUnit: string
  sequence: string
  milliseconds: string
  properties: string
  variables: string
  events: string
  sendEvents: string
  receiveEvents: string
  eventSource: string
  transitionListen: string
  internalEvents: string
  internalEventHint: string
  locate: string
  simulation: string
  stateId: string
  stateLabel: string
  kind: string
  parent: string
  initial: string
  entryActions: string
  exitActions: string
  historyType: string
  shallow: string
  deep: string
  cond: string
  actionsHint: string
  rootInitial: string
  none: string
  variableName: string
  variableExpr: string
  addVariable: string
  noVariables: string
  knownEvents: string
  inject: string
  send: string
  customEvent: string
  dataJson: string
  assign: string
  assignExpr: string
  log: string
  clear: string
  active: string
  emptyDoc: string
  emptyHint: string
  validation: string
  validationPassed: string
  validationFailed: string
  close: string
  cancel: string
  confirm: string
  dirty: string
  saving: string
  saved: string
  runningHint: string
  readOnly: string
  unknownError: string
  noDomParser: string
}

export const DEFAULT_LABELS: EditorLabels = {
  appTitle: '状态图编辑器',
  projectName: '工程名',
  undo: '↶ 撤销',
  redo: '↷ 重做',
  newDoc: '新建',
  open: '打开',
  save: '保存',
  examples: '示例',
  openExample: '打开示例…',
  validate: '校验',
  run: '▶ 运行',
  stop: '■ 停止',
  pause: '⏸ 暂停',
  play: '▶ 继续',
  step: '⏭ 单步',
  speed: '速度',
  exportScxml: '导出 SCXML',
  deploy: '⇪ 部署草稿',
  deploying: '部署中…',
  exit: '退出编辑',
  structure: '结构',
  states: '状态',
  transitions: '转移',
  filter: '筛选状态 / 事件 / 条件',
  addState: '＋状态',
  addCompound: '＋组合',
  addParallel: '＋并行',
  addFinal: '＋终态',
  addHistory: '＋历史',
  delete: '删除',
  noStates: '还没有状态：从上方按钮添加，或打开示例。',
  noTransitions: '暂无转移',
  addTransition: '添加转移',
  source: '源',
  target: '目标',
  event: '事件',
  eventHint: '事件名（留空 = 无事件转移）',
  delay: '延时触发',
  delayMs: '延时',
  delayUnit: '单位',
  sequence: '秒',
  milliseconds: '毫秒',
  properties: '属性',
  variables: '变量',
  events: '事件',
  sendEvents: '发送事件',
  receiveEvents: '接收事件',
  eventSource: '来源',
  transitionListen: '转移监听',
  internalEvents: '内部延时事件',
  internalEventHint: '系统自动生成；只在本机内部收发，不参与广播、路由或 MQTT。',
  locate: '定位',
  simulation: '仿真',
  stateId: 'SCXML id',
  stateLabel: '显示名',
  kind: '类型',
  parent: '父状态',
  initial: '初始子状态',
  entryActions: '进入动作',
  exitActions: '退出动作',
  historyType: '历史类型',
  shallow: '浅历史',
  deep: '深历史',
  cond: '条件（JS）',
  actionsHint: '每行一条动作：send / cancel / assign / log / 自定义 JS',
  rootInitial: '根初始状态',
  none: '（无）',
  variableName: '变量名',
  variableExpr: '初始表达式',
  addVariable: '＋变量',
  noVariables: '暂无变量',
  knownEvents: '已知事件',
  inject: '事件注入',
  send: '发送',
  customEvent: '自定义事件名',
  dataJson: 'JSON 数据，如 {"v":1}',
  assign: '赋值',
  assignExpr: 'JS 表达式，如 100',
  log: '运行日志',
  clear: '清空',
  active: '激活',
  emptyDoc: '空文档',
  emptyHint: '从左侧添加状态，或用工具栏打开示例',
  validation: '校验',
  validationPassed: '校验通过',
  validationFailed: '校验失败',
  close: '关闭',
  cancel: '取消',
  confirm: '确认',
  dirty: '有未保存更改',
  saving: '保存中…',
  saved: '已保存',
  runningHint: '仿真中：结构编辑已锁定',
  readOnly: '只读模式',
  unknownError: '未知错误',
  noDomParser: 'Node 环境需要注入 DOMParser',
}
