/**
 * 内置示例工程：交通灯（与 scxmljs 官方 README 示例一致，便于对照验证）。
 * 动作使用本项目的动作 DSL（见 serializer.ts 头注释）：
 *   - entry 的 `send timer delay 3s id timer` → <send event="timer" delay="3s" id="timer"/>
 *   - exit  的 `cancel timer`                 → <cancel sendid="timer"/>
 *   - yellow→red 的 `assign cycles = cycles + 1` → <assign .../>
 */
import { emptyDoc, newUid, type ProjectDoc, type StateKind, type StateNode } from './model'

function st(uid: string, id: string, label: string, kind: StateKind, parent: string | null, extra: Partial<StateNode> = {}): StateNode {
  return { uid, id, label, kind, parent, initial: null, entryActions: [], exitActions: [], ...extra }
}

export function trafficLightDoc(): ProjectDoc {
  const doc = emptyDoc('traffic-light')
  const uOn = newUid('on'), uRed = newUid('red'), uGreen = newUid('green'), uYellow = newUid('yellow'), uOff = newUid('off')
  doc.datamodel = [{ id: 'cycles', expr: '0' }]
  doc.initial = uOn
  doc.states = [
    st(uOn, 'on', '运行', 'compound', null, { initial: uRed }),
    st(uRed, 'red', '红灯 3s', 'atomic', uOn, { entryActions: ['send timer delay 3s id timer'], exitActions: ['cancel timer'] }),
    st(uGreen, 'green', '绿灯 3s', 'atomic', uOn, { entryActions: ['send timer delay 3s id timer'], exitActions: ['cancel timer'] }),
    st(uYellow, 'yellow', '黄灯 1s', 'atomic', uOn, { entryActions: ['send timer delay 1s id timer'], exitActions: ['cancel timer'] }),
    st(uOff, 'off', '停止', 'final', null),
  ]
  doc.transitions = [
    { id: 'ex-power', source: uOn, target: uOff, event: 'power.off', cond: '', actions: [] },
    { id: 'ex-r2g', source: uRed, target: uGreen, event: 'timer', cond: '', actions: [] },
    { id: 'ex-g2y', source: uGreen, target: uYellow, event: 'timer', cond: '', actions: [] },
    { id: 'ex-y2r', source: uYellow, target: uRed, event: 'timer', cond: '', actions: ['assign cycles = cycles + 1'] },
  ]
  // 初始布局：on 容器包住三个灯；off 在右侧
  doc.layout = {
    [uOn]: { x: 80, y: 80, w: 620, h: 260 },
    [uRed]: { x: 120, y: 150, w: 150, h: 64 },
    [uGreen]: { x: 320, y: 150, w: 150, h: 64 },
    [uYellow]: { x: 520, y: 150, w: 150, h: 64 },
    [uOff]: { x: 820, y: 170, w: 150, h: 64 },
  }
  return doc
}

/**
 * 进入/退出动作演示：onentry / onexit 的执行时机与顺序（exit 先于 entry）。
 * 仿真时反复注入 switch，观察日志区 exit→entry 顺序输出，变量 visits 递增。
 */
export function entryExitDoc(): ProjectDoc {
  const doc = emptyDoc('entry-exit-demo')
  doc.datamodel = [{ id: 'visits', expr: '0' }]
  const uRoom = newUid('room')
  const uDark = newUid('dark')
  const uLit = newUid('lit')
  doc.initial = uRoom
  doc.states = [
    st(uRoom, 'room', '房间', 'compound', null, { initial: uDark }),
    st(uDark, 'dark', '暗', 'atomic', uRoom, {
      entryActions: ['log "进入：暗"'],
      exitActions: ['log "退出：暗（开灯前先退出暗）"'],
    }),
    st(uLit, 'lit', '明', 'atomic', uRoom, {
      entryActions: ['assign visits = visits + 1', "log '进入：亮（第 ' + visits + ' 次开灯）'"],
      exitActions: ['log "退出：亮（关灯前先退出亮）"'],
    }),
  ]
  doc.transitions = [
    { id: 'ex-sw1', source: uDark, target: uLit, event: 'switch', cond: '', actions: [] },
    { id: 'ex-sw2', source: uLit, target: uDark, event: 'switch', cond: '', actions: [] },
  ]
  doc.layout = {}
  return doc
}

/**
 * 延时发送与取消演示：entry 布防 3 秒闹钟（send alarm delay 3s id alarm），
 * exit 撤防（cancel alarm）——等价于 Stateflow 的 after(n, sec) 与其撤销。
 * 仿真：运行后 3 秒内注入 pause → 闹钟被取消不超时；resume 重新布防，
 * 若不 pause，3 秒后 alarm 触发进入超时态。
 */
export function sendCancelDoc(): ProjectDoc {
  const doc = emptyDoc('send-cancel-demo')
  const uWatch = newUid('watch')
  const uRun = newUid('run')
  const uPause = newUid('pause')
  const uTime = newUid('timedout')
  const uDone = newUid('done')
  doc.initial = uWatch
  doc.states = [
    st(uWatch, 'watching', '监视中', 'compound', null, { initial: uRun }),
    st(uRun, 'running', '运行（已布防）', 'atomic', uWatch, {
      entryActions: ['send alarm delay 3s id alarm', 'log "已布防：3 秒内不 pause 将超时"'],
      exitActions: ['cancel alarm', 'log "退出：撤防"'],
    }),
    st(uPause, 'paused', '已暂停', 'atomic', uWatch),
    st(uTime, 'timedout', '超时！', 'atomic', uWatch, {
      entryActions: ['log "超时：3 秒内未暂停"'],
    }),
    st(uDone, 'done', '结束', 'final', null),
  ]
  doc.transitions = [
    { id: 'ex-pause', source: uRun, target: uPause, event: 'pause', cond: '', actions: [] },
    { id: 'ex-resume', source: uPause, target: uRun, event: 'resume', cond: '', actions: [] },
    { id: 'ex-alarm', source: uRun, target: uTime, event: 'alarm', cond: '', actions: [] },
    { id: 'ex-retry', source: uTime, target: uRun, event: 'retry', cond: '', actions: [] },
    { id: 'ex-stop', source: uWatch, target: uDone, event: 'stop', cond: '', actions: [] },
  ]
  doc.layout = {}
  return doc
}

/**
 * 故障全局转移 + 条件路由演示（覆盖：祖先级全局转移 / 同名事件不同源 / 与或非）：
 * - fault 转移挂在公共祖先 system 上：run 并行区域、guard 条件态，任意位置发
 *   fault 都进入顶层故障态；reset 恢复（Stateflow 中即"层级转移/全局故障处理"）；
 * - toggle 事件定义在加热/搅拌两个区域的 4 个状态上（同名事件、不同源/目标），
 *   注入一次两个区域同时切换；
 * - guard1 →(temp > 80 && door)→ guard2 →(temp > 80 || door)→ guard3
 *   →(!door)→ guard1，配 heatup/opendoor/closedoor 自环改变变量。
 */
export function faultCondDoc(): ProjectDoc {
  const doc = emptyDoc('fault-cond-demo')
  doc.datamodel = [
    { id: 'temp', expr: '0' },
    { id: 'door', expr: 'false' },
  ]
  const uSys = newUid('sys')
  const uRun = newUid('run')
  const uHeat = newUid('heat')
  const uCool = newUid('cool')
  const uHot = newUid('hot')
  const uStir = newUid('stir')
  const uStop = newUid('stop')
  const uSRun = newUid('srun')
  const uG1 = newUid('g1')
  const uG2 = newUid('g2')
  const uG3 = newUid('g3')
  const uFault = newUid('faulted')

  doc.initial = uSys
  doc.states = [
    st(uSys, 'system', '设备主控', 'compound', null, { initial: uRun }),
    st(uRun, 'run', '作业（并行）', 'parallel', uSys),
    st(uHeat, 'heat', '加热', 'compound', uRun, { initial: uCool }),
    st(uCool, 'cool', '加热·关', 'atomic', uHeat),
    st(uHot, 'hot', '加热·开', 'atomic', uHeat),
    st(uStir, 'stir', '搅拌', 'compound', uRun, { initial: uStop }),
    st(uStop, 'stopped', '搅拌·停', 'atomic', uStir),
    st(uSRun, 'running', '搅拌·转', 'atomic', uStir),
    st(uG1, 'guard1', '条件·与', 'atomic', uSys),
    st(uG2, 'guard2', '条件·或', 'atomic', uSys),
    st(uG3, 'guard3', '条件·非', 'atomic', uSys),
    st(uFault, 'faulted', '故障', 'atomic', null),
  ]
  doc.transitions = [
    // 同名事件 toggle：4 个不同源/目标
    { id: 'ex-t1', source: uCool, target: uHot, event: 'toggle', cond: '', actions: [] },
    { id: 'ex-t2', source: uHot, target: uCool, event: 'toggle', cond: '', actions: [] },
    { id: 'ex-s1', source: uStop, target: uSRun, event: 'toggle', cond: '', actions: [] },
    { id: 'ex-s2', source: uSRun, target: uStop, event: 'toggle', cond: '', actions: [] },
    // 全局故障（祖先转移）+ 恢复
    { id: 'ex-fault', source: uSys, target: uFault, event: 'fault', cond: '', actions: [] },
    { id: 'ex-reset', source: uFault, target: uSys, event: 'reset', cond: '', actions: [] },
    // 进入条件路由
    { id: 'ex-inspect', source: uRun, target: uG1, event: 'inspect', cond: '', actions: [] },
    // 条件路由：与 / 或 / 非
    { id: 'ex-and', source: uG1, target: uG2, event: 'check', cond: 'temp > 80 && door', actions: [] },
    { id: 'ex-or', source: uG2, target: uG3, event: 'check', cond: 'temp > 80 || door', actions: [] },
    { id: 'ex-not', source: uG3, target: uG1, event: 'check', cond: '!door', actions: [] },
    // 改变量的自环
    { id: 'ex-heatup', source: uG1, target: uG1, event: 'heatup', cond: '', actions: ['assign temp = temp + 50'] },
    { id: 'ex-open1', source: uG1, target: uG1, event: 'opendoor', cond: '', actions: ['assign door = true'] },
    { id: 'ex-close1', source: uG1, target: uG1, event: 'closedoor', cond: '', actions: ['assign door = false'] },
    { id: 'ex-open3', source: uG3, target: uG3, event: 'opendoor', cond: '', actions: ['assign door = true'] },
    { id: 'ex-close3', source: uG3, target: uG3, event: 'closedoor', cond: '', actions: ['assign door = false'] },
  ]
  doc.layout = {}
  return doc
}

/**
 * 动作演示（结构化动作编辑器的展示/验证案例）：
 * - 开机转移动作完成初始化（温度/次数清零）并布防采样定时器（send delay）；
 * - 「采样」同名事件两条转移按条件先后生效（文档顺序优先级）：温度 < 60 时
 *   自环升温并重发定时器；温度 >= 60 时跳转「达标」，其 entry 撤销定时器（cancel）；
 * - ⚠ 教学点：自环是外部转移（退出重入），entry 会在每次重入时重跑——因此
 *   初始化放在「开机」转移动作里而不是运行态 entry（否则温度每次被清零、永不达标）。
 */
export function actionDemoDoc(): ProjectDoc {
  const doc = emptyDoc('action-demo')
  doc.datamodel = [
    { id: '温度', expr: '0' },
    { id: '次数', expr: '0' },
  ]
  const uStop = newUid('stop')
  const uRun = newUid('run')
  const uOk = newUid('ok')
  doc.initial = uStop
  doc.states = [
    st(uStop, '停机', '停机', 'atomic', null),
    st(uRun, '运行', '运行', 'atomic', null, {
      exitActions: ['cancel 采样', 'log "关机"'],
    }),
    st(uOk, '达标', '达标', 'atomic', null, {
      entryActions: ['cancel 采样', 'log "达标：温度 >= 60"'],
    }),
  ]
  doc.transitions = [
    {
      id: 'ex-boot',
      source: uStop,
      target: uRun,
      event: '开机',
      cond: '',
      actions: ['assign 温度 = 0', 'assign 次数 = 0', 'send 采样 delay 1s id 采样'],
    },
    {
      id: 'ex-sample-up',
      source: uRun,
      target: uRun,
      event: '采样',
      cond: '温度 < 60',
      actions: ['assign 温度 = 温度 + 20', 'assign 次数 = 次数 + 1', 'send 采样 delay 1s id 采样'],
    },
    { id: 'ex-sample-ok', source: uRun, target: uOk, event: '采样', cond: '温度 >= 60', actions: [] },
    { id: 'ex-off', source: uRun, target: uStop, event: '关机', cond: '', actions: [] },
    { id: 'ex-off2', source: uOk, target: uStop, event: '关机', cond: '', actions: [] },
  ]
  doc.layout = {}
  return doc
}

/** 所有内置示例（工具栏"示例"选择器用） */
export const EXAMPLES: { name: string; make: () => ProjectDoc }[] = [
  { name: '交通灯（官方示例）', make: trafficLightDoc },
  { name: '并行加热/搅拌 + 深历史恢复', make: parallelHistoryDoc },
  { name: '进入/退出动作演示', make: entryExitDoc },
  { name: '延时发送与取消（send delay / cancel）', make: sendCancelDoc },
  { name: '故障全局转移 + 条件与或非', make: faultCondDoc },
  { name: '动作演示（采样升温循环）', make: actionDemoDoc },
  { name: '极限演示：并行 + 深浅历史 + 自定义 JS', make: extremeDemoDoc },
]

/**
 * 极限演示「柔性生产线」：把当前支持的 SCXML 特性压进一张图（仅浏览器仿真——
 * 含 script 动作，服务端部署闸门会拒绝）。
 *
 * 结构：main（compound）
 *  ├─ work（parallel 作业区，三区并行）
 *  │   ├─ 机械臂：待机 --件到→ 夹取中（entry 布防 2s 臂节拍，落料自环回去，JS 统计节拍）
 *  │   ├─ 传送带：停 --(无事件自动启动)→ 运转（entry JS 记录时刻 + 1s 步进自环，每步 send 件到）
 *  │   └─ 质检位：待检 --件到→ 检测中（entry JS Math.random 生成良品率）
 *  │        ├─(无事件 ≥90)→ 待检（assign 合格数+1）
 *  │        └─(无事件 <90)→ 返修中（1.2s 返修完回待检）
 *  ├─ done 批次完成：work --(无事件 合格数≥目标数)→ done（entry JS 生成报告 + send ge_批次完成）
 *  ├─ crashed 故障停机：main --故障→ crashed（祖先转移，从并行区任意深处触发）
 *  │    ├─ --重启（深恢复）→ hd 深历史（恢复各区退出前的内部状态）
 *  │    └─ --浅恢复 → hs 浅历史（恢复到各区初始态；传送带停在"停"时无事件自动启动会再拉起）
 *  └─ done --新批次→ work（JS 批次号自增 + 计数清零，进入下一轮）
 *
 * 观察点：① 无注入即自动流水（无事件转移链：停→运转→步进→件到→质检→…→done）
 * ② 深浅历史差异：故障后分别用「重启/浅恢复」对比各区恢复位置
 * ③ 自定义 JS 多行脚本（编辑器 textarea 可展开）、随机数让每轮结果不同
 * ④ 同名多监听（件到同时驱动机械臂与质检位）
 */
export function extremeDemoDoc(): ProjectDoc {
  const doc = emptyDoc('extreme-demo')
  doc.datamodel = [
    { id: '目标数', expr: '3' },
    { id: '合格数', expr: '0' },
    { id: '夹取数', expr: '0' },
    { id: '步进数', expr: '0' },
    { id: '良品率', expr: '0' },
    { id: '累计节拍', expr: '0' },
    { id: '故障次数', expr: '0' },
    { id: '批次号', expr: '1' },
    { id: '报告', expr: '""' },
  ]
  const uMain = newUid('main')
  const uWork = newUid('work')
  const uArm = newUid('arm')
  const uArmIdle = newUid('armIdle')
  const uArmBusy = newUid('armBusy')
  const uBelt = newUid('belt')
  const uBeltStop = newUid('beltStop')
  const uBeltRun = newUid('beltRun')
  const uQc = newUid('qc')
  const uQcWait = newUid('qcWait')
  const uQcCheck = newUid('qcCheck')
  const uQcRework = newUid('qcRework')
  const uCrash = newUid('crashed')
  const uDone = newUid('done')
  const uHd = newUid('hd')
  const uHs = newUid('hs')

  doc.initial = uMain
  doc.states = [
    st(uMain, 'main', '柔性生产线', 'compound', null, { initial: uWork }),
    st(uWork, 'work', '作业区（并行：机械臂 ∥ 传送带 ∥ 质检位）', 'parallel', uMain),
    st(uArm, 'arm', '机械臂', 'compound', uWork, { initial: uArmIdle }),
    st(uArmIdle, 'armIdle', '机械臂·待机', 'atomic', uArm),
    st(uArmBusy, 'armBusy', '机械臂·夹取中', 'atomic', uArm, {
      entryActions: ['send 臂落料 delay 2s id 臂T'],
      exitActions: ['cancel 臂T'],
    }),
    st(uBelt, 'belt', '传送带', 'compound', uWork, { initial: uBeltStop }),
    st(uBeltStop, 'beltStop', '传送带·停', 'atomic', uBelt),
    st(uBeltRun, 'beltRun', '传送带·运转', 'atomic', uBelt, {
      entryActions: [
        '/* JS：记录启动时刻\n   （每次重入都会刷新） */\n带启动时刻 = new Date().toISOString()',
        'send 带步进 delay 1s id 带T',
      ],
      exitActions: ['cancel 带T'],
    }),
    st(uQc, 'qc', '质检位', 'compound', uWork, { initial: uQcWait }),
    st(uQcWait, 'qcWait', '质检位·待检', 'atomic', uQc),
    st(uQcCheck, 'qcCheck', '质检位·检测中', 'atomic', uQc, {
      entryActions: [
        '/* JS：模拟质检波动（Math.random）\n   良品率决定下一跳：≥90 合格 / 否则返修 */\n良品率 = Math.round(75 + Math.random() * 25)',
      ],
    }),
    st(uQcRework, 'qcRework', '质检位·返修中', 'atomic', uQc, {
      entryActions: ['send 返修完 delay 1.2s id 返T'],
      exitActions: ['cancel 返T'],
    }),
    st(uCrash, 'crashed', '故障停机', 'atomic', null),
    st(uDone, 'done', '批次完成', 'atomic', null, {
      entryActions: [
        '/* JS：生成批次报告 */\n报告 = "批次 " + 批次号 + " 完成：合格 " + 合格数 + "/" + 目标数 + "，良品率 " + 良品率 + "%"',
        'send ge_批次完成',
      ],
    }),
    st(uHd, 'hd', '深历史', 'history', uMain, { historyType: 'deep' }),
    st(uHs, 'hs', '浅历史', 'history', uMain, { historyType: 'shallow' }),
  ]
  doc.transitions = [
    // 机械臂：件到 → 夹取（2s 后落料回待机）；JS 统计节拍
    { id: 'xm-grab', source: uArmIdle, target: uArmBusy, event: '件到', cond: '', actions: [] },
    {
      id: 'xm-drop',
      source: uArmBusy,
      target: uArmIdle,
      event: '臂落料',
      cond: '',
      actions: [
        'assign 夹取数 = 夹取数 + 1',
        '/* JS：节拍统计 */\n累计节拍 = 累计节拍 + 1\n报告 = "最近节拍 #" + 累计节拍',
      ],
    },
    // 传送带：无事件自动启动（初始化/浅恢复回到"停"都会再拉起）；暂停手动、恢复用事件
    { id: 'xm-belt-auto', source: uBeltStop, target: uBeltRun, event: '', cond: '', actions: [] },
    { id: 'xm-belt-pause', source: uBeltRun, target: uBeltStop, event: '暂停', cond: '', actions: [] },
    { id: 'xm-belt-resume', source: uBeltStop, target: uBeltRun, event: '恢复', cond: '', actions: [] },
    // 步进自环（重入重跑 entry：刷新计时器）：每步 send 件到 同时喂机械臂与质检位
    {
      id: 'xm-belt-step',
      source: uBeltRun,
      target: uBeltRun,
      event: '带步进',
      cond: '',
      actions: ['assign 步进数 = 步进数 + 1', 'send 件到'],
    },
    // 质检：待检 --件到→ 检测中；JS 定良品率后无事件分派（≥90 合格 / 否则返修）
    { id: 'xm-qc-in', source: uQcWait, target: uQcCheck, event: '件到', cond: '', actions: [] },
    {
      id: 'xm-qc-pass',
      source: uQcCheck,
      target: uQcWait,
      event: '',
      cond: '良品率 >= 90',
      actions: ['assign 合格数 = 合格数 + 1'],
    },
    { id: 'xm-qc-fail', source: uQcCheck, target: uQcRework, event: '', cond: '良品率 < 90', actions: [] },
    { id: 'xm-qc-reworked', source: uQcRework, target: uQcWait, event: '返修完', cond: '', actions: [] },
    // 祖先转移（层级转移）：并行区任意深处发 故障 → 整体进入故障停机
    {
      id: 'xm-fault',
      source: uMain,
      target: uCrash,
      event: '故障',
      cond: '',
      actions: [
        'assign 故障次数 = 故障次数 + 1',
        '/* JS：故障快照 */\n报告 = "第 " + 故障次数 + " 次故障；重启可深/浅恢复现场"',
      ],
    },
    // 批次完成判定（无事件）：work → done
    { id: 'xm-done', source: uWork, target: uDone, event: '', cond: '合格数 >= 目标数', actions: [] },
    // 深浅双历史恢复 + 各自默认转移
    { id: 'xm-restart-deep', source: uCrash, target: uHd, event: '重启', cond: '', actions: [] },
    { id: 'xm-restart-shallow', source: uCrash, target: uHs, event: '浅恢复', cond: '', actions: [] },
    { id: 'xm-hd-default', source: uHd, target: uWork, event: '', cond: '', actions: [] },
    { id: 'xm-hs-default', source: uHs, target: uWork, event: '', cond: '', actions: [] },
    // 新一轮批次：done → work（JS 批次号自增 + 计数清零）
    {
      id: 'xm-next',
      source: uDone,
      target: uWork,
      event: '新批次',
      cond: '',
      actions: [
        'assign 合格数 = 0',
        'assign 夹取数 = 0',
        'assign 步进数 = 0',
        '/* JS：批次号自增 */\n批次号 = 批次号 + 1\n报告 = "新批次 #" + 批次号 + " 开工"',
      ],
    },
  ]
  doc.layout = {}
  return doc
}

/**
 * 并行 + 历史演示（SCXML 历史语义：父状态退出时记录，转入历史伪态时恢复）：
 * - work 是并行状态，两个 region（加热/搅拌）同时运行、独立切换；
 * - main --abort--> crashed：main 整体退出，此刻深历史 h 记录全部后代配置；
 * - crashed --restart--> h：深历史恢复 main，且两个 region 回到退出前的内部状态（on+running）；
 * - h 的默认转移（无事件）指向 work：main 从未被退出过时 restart 的入口。
 */
export function parallelHistoryDoc(): ProjectDoc {
  const doc = emptyDoc('parallel-history-demo')
  const uMain = newUid('main')
  const uWork = newUid('work')
  const uHeat = newUid('heat')
  const uHeatOff = newUid('heatoff')
  const uHeatOn = newUid('heaton')
  const uStir = newUid('stir')
  const uStirStop = newUid('stirstop')
  const uStirRun = newUid('stirrun')
  const uHist = newUid('hist')
  const uCrash = newUid('crashed')

  doc.initial = uMain
  doc.states = [
    st(uMain, 'main', '主控', 'compound', null, { initial: uWork }),
    st(uWork, 'work', '作业（并行）', 'parallel', uMain),
    st(uHeat, 'heat', '加热', 'compound', uWork, { initial: uHeatOff }),
    st(uHeatOff, 'off', '加热·关', 'atomic', uHeat),
    st(uHeatOn, 'on', '加热·开', 'atomic', uHeat),
    st(uStir, 'stir', '搅拌', 'compound', uWork, { initial: uStirStop }),
    st(uStirStop, 'stopped', '搅拌·停', 'atomic', uStir),
    st(uStirRun, 'running', '搅拌·转', 'atomic', uStir),
    st(uHist, 'last', '历史', 'history', uMain, { historyType: 'deep' }),
    st(uCrash, 'crashed', '故障停机', 'atomic', null),
  ]
  doc.transitions = [
    { id: 'ex-h-on', source: uHeatOff, target: uHeatOn, event: 'turnOn', cond: '', actions: [] },
    { id: 'ex-h-off', source: uHeatOn, target: uHeatOff, event: 'turnOff', cond: '', actions: [] },
    { id: 'ex-s-run', source: uStirStop, target: uStirRun, event: 'start', cond: '', actions: [] },
    { id: 'ex-s-stop', source: uStirRun, target: uStirStop, event: 'stop', cond: '', actions: [] },
    { id: 'ex-abort', source: uMain, target: uCrash, event: 'abort', cond: '', actions: [] },
    { id: 'ex-restart', source: uCrash, target: uHist, event: 'restart', cond: '', actions: [] },
    // 历史默认转移（无事件/条件）：main 从未退出过时 restart 的入口
    { id: 'ex-hist-default', source: uHist, target: uWork, event: '', cond: '', actions: [] },
  ]
  doc.layout = {}
  return doc
}
