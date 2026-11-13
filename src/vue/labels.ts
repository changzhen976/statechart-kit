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
  noTarget: string
  internalTransition: string
  transitionType: string
  internal: string
  external: string
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
  eventSourceInternal: string
  eventSourceSend: string
  eventSourceAutoDelay: string
  eventSourceExternal: string
  eventSourceListenOnly: string
  eventVisibility: string
  visibilityBoth: string
  visibilityInternal: string
  eventInternalBlocked: string
  locate: string
  simulation: string
  explorer: string
  explorerTransitions: string
  collapse: string
  expand: string
  explorerNoState: string
  explorerNoTransitions: string
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
  doneData: string
  doneDataNone: string
  doneDataExpr: string
  doneDataExprMode: string
  doneDataContent: string
  doneDataContentMode: string
  doneDataParamsMode: string
  doneDataAddParam: string
  doneDataParamName: string
  doneDataParamExpr: string
  doneDataSwitchConfirm: string
  doneDataReadOnly: string
  clearDoneData: string
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
  noTarget: '（内部转移）',
  internalTransition: '内部转移',
  transitionType: '转移类型',
  internal: 'internal',
  external: 'external',
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
  eventSourceInternal: '内部 raise',
  eventSourceSend: '本机 send',
  eventSourceAutoDelay: '自动延时',
  eventSourceExternal: '外部来源',
  eventSourceListenOnly: '仅监听',
  eventVisibility: '可见性',
  visibilityBoth: '双向',
  visibilityInternal: '仅内部',
  eventInternalBlocked: '事件 {name} 仅允许内部触发，已忽略外部注入',
  locate: '定位',
  simulation: '仿真',
  explorer: 'Explorer',
  explorerTransitions: '状态转移',
  collapse: '收起',
  expand: '展开',
  explorerNoState: '在 Explorer 中选择一个状态',
  explorerNoTransitions: '该状态没有出边',
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
  doneData: '完成数据',
  doneDataNone: '（无完成数据）',
  doneDataExpr: '完成数据表达式（JS）',
  doneDataExprMode: 'content expr',
  doneDataContent: 'content 文本，如 {"a":1}',
  doneDataContentMode: 'content 文本',
  doneDataParamsMode: 'param 列表',
  doneDataAddParam: '＋参数',
  doneDataParamName: '参数名',
  doneDataParamExpr: '表达式',
  doneDataSwitchConfirm: '切换完成数据形式会清除当前内容，继续？',
  doneDataReadOnly: '该终态使用 content/param 形式；当前版本只读保留，清除后可改表达式。',
  clearDoneData: '清除完成数据',
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

/** English preset for hosts that want an en-US editor. */
export const DEFAULT_LABELS_EN: EditorLabels = {
  appTitle: 'Statechart Editor',
  projectName: 'Project name',
  undo: '↶ Undo',
  redo: '↷ Redo',
  newDoc: 'New',
  open: 'Open',
  save: 'Save',
  examples: 'Examples',
  openExample: 'Open example…',
  validate: 'Validate',
  run: '▶ Run',
  stop: '■ Stop',
  pause: '⏸ Pause',
  play: '▶ Resume',
  step: '⏭ Step',
  speed: 'Speed',
  exportScxml: 'Export SCXML',
  deploy: '⇪ Deploy draft',
  deploying: 'Deploying…',
  exit: 'Exit editor',
  structure: 'Structure',
  states: 'States',
  transitions: 'Transitions',
  filter: 'Filter states / events / conditions',
  addState: '＋State',
  addCompound: '＋Compound',
  addParallel: '＋Parallel',
  addFinal: '＋Final',
  addHistory: '＋History',
  delete: 'Delete',
  noStates: 'No states yet: add one above or open an example.',
  noTransitions: 'No transitions',
  addTransition: 'Add transition',
  source: 'Source',
  target: 'Target',
  noTarget: '(internal transition)',
  internalTransition: 'Internal transition',
  transitionType: 'Transition type',
  internal: 'internal',
  external: 'external',
  event: 'Event',
  eventHint: 'Event name (empty = eventless transition)',
  delay: 'Delayed transition',
  delayMs: 'Delay',
  delayUnit: 'Unit',
  sequence: 'seconds',
  milliseconds: 'ms',
  properties: 'Properties',
  variables: 'Variables',
  events: 'Events',
  sendEvents: 'Sent events',
  receiveEvents: 'Received events',
  eventSource: 'Source',
  transitionListen: 'Transition listeners',
  internalEvents: 'Internal delayed events',
  internalEventHint:
    'Generated automatically; local only, not broadcast, routed, or sent over MQTT.',
  eventSourceInternal: 'internal raise',
  eventSourceSend: 'local send',
  eventSourceAutoDelay: 'auto delay',
  eventSourceExternal: 'external source',
  eventSourceListenOnly: 'listen only',
  eventVisibility: 'Visibility',
  visibilityBoth: 'Both',
  visibilityInternal: 'Internal only',
  eventInternalBlocked: 'Event {name} is internal-only; external injection ignored',
  locate: 'Locate',
  simulation: 'Simulation',
  explorer: 'Explorer',
  explorerTransitions: 'Transitions',
  collapse: 'Collapse',
  expand: 'Expand',
  explorerNoState: 'Select a state in Explorer',
  explorerNoTransitions: 'This state has no outgoing transitions',
  stateId: 'SCXML id',
  stateLabel: 'Label',
  kind: 'Kind',
  parent: 'Parent',
  initial: 'Initial child',
  entryActions: 'Entry actions',
  exitActions: 'Exit actions',
  historyType: 'History type',
  shallow: 'Shallow history',
  deep: 'Deep history',
  doneData: 'Done data',
  doneDataNone: '(no done data)',
  doneDataExpr: 'Done data expression (JS)',
  doneDataExprMode: 'content expr',
  doneDataContent: 'content text, e.g. {"a":1}',
  doneDataContentMode: 'content text',
  doneDataParamsMode: 'param list',
  doneDataAddParam: '＋Param',
  doneDataParamName: 'Param name',
  doneDataParamExpr: 'Expression',
  doneDataSwitchConfirm: 'Switching the done data form clears current content. Continue?',
  doneDataReadOnly:
    'This final state uses content/param; read-only in this version. Clear it to edit the expression.',
  clearDoneData: 'Clear done data',
  cond: 'Condition (JS)',
  actionsHint: 'One action per line: send / cancel / assign / log / custom JS',
  rootInitial: 'Root initial state',
  none: '(none)',
  variableName: 'Variable name',
  variableExpr: 'Initial expression',
  addVariable: '＋Variable',
  noVariables: 'No variables',
  knownEvents: 'Known events',
  inject: 'Inject event',
  send: 'Send',
  customEvent: 'Custom event name',
  dataJson: 'JSON data, e.g. {"v":1}',
  assign: 'Assign',
  assignExpr: 'JS expression, e.g. 100',
  log: 'Run log',
  clear: 'Clear',
  active: 'Active',
  emptyDoc: 'Empty document',
  emptyHint: 'Add a state from the left, or open an example from the toolbar',
  validation: 'Validation',
  validationPassed: 'Validation passed',
  validationFailed: 'Validation failed',
  close: 'Close',
  cancel: 'Cancel',
  confirm: 'Confirm',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  runningHint: 'Simulation running: structure editing is locked',
  readOnly: 'Read-only mode',
  unknownError: 'Unknown error',
  noDomParser: 'Node environment requires a DOMParser',
}
