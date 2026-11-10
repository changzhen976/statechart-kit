/**
 * P1 命名策略验证：
 *   A. SERVER_POLICY 与 donor 行为等价（事件/变量/部署闸门/路由保留/广播）
 *   B. 自定义策略注入（core 不认识 `gv_` 等服务端前缀）
 *   C. BASE_POLICY 无前缀规则
 *   D. 策略驱动迁移（g_ → gv_/ge_/t_/sys.）
 *   E. 静态守卫：core 源码不硬编码服务端前缀
 *
 * 运行：npm run test:naming
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkDocNaming,
  checkEventName,
  checkVarName,
  isBroadcastEvent,
  isReservedRouteEvent,
} from '../src/core/naming'
import { BASE_POLICY, type NamingPolicy } from '../src/core/naming-policy'
import { migrateDoc, migrateEventName, migrateExpr, migrateVarName } from '../src/core/migrate'
import { emptyDoc, newUid, type ProjectDoc, type StateNode } from '../src/core/model'
import { SERVER_POLICY } from './fixtures/server-policy'

let pass = 0
let fail = 0
function assert(cond: unknown, msg: string): void {
  if (cond) {
    pass++
    console.log('  OK', msg)
  } else {
    fail++
    console.error('  FAIL:', msg)
  }
}

const codeOf = (v: { code: string } | null): string => (v ? v.code : 'none')

console.log('── A) SERVER_POLICY（与 donor 行为等价）──')
{
  const ev = (name: string) => checkEventName(SERVER_POLICY, name)
  assert(ev('alarm') === null, '普通事件 alarm 合法')
  assert(ev('ge_alarm') === null, 'ge_ 广播事件合法')
  assert(ev('mqe_topic') === null, 'mqe_ 边界事件合法')
  assert(codeOf(ev('t_tick')) === 'naming.prefix.not-for-event', 't_ 时钟事件被拦截（not-for-event）')
  assert(codeOf(ev('sys.changed.x')) === 'naming.prefix.not-for-event', 'sys. 系统事件被拦截')
  assert(codeOf(ev('gv_count')) === 'naming.prefix.not-for-event', 'gv_ 变量前缀不能用作事件')
  assert(codeOf(ev('mqv_local')) === 'naming.prefix.not-for-event', 'mqv_ 变量前缀不能用作事件')
  assert(codeOf(ev('g_old')) === 'naming.legacy-prefix', 'g_ 遗留前缀被拦截（legacy-prefix）')
  const listen = checkEventName(SERVER_POLICY, 't_tick', { mode: 'listen' })
  assert(listen === null, '监听 t_ 事件合法（listen 模式）')

  const va = (name: string) => checkVarName(SERVER_POLICY, name)
  assert(va('gv_count') === null, 'gv_ 全局变量合法')
  assert(va('local') === null, '无前缀本地变量合法')
  assert(codeOf(va('ge_alarm')) === 'naming.prefix.not-for-variable', 'ge_ 事件前缀不能用作变量')
  assert(codeOf(va('mqe_topic')) === 'naming.prefix.not-for-variable', 'mqe_ 事件前缀不能用作变量')
  assert(codeOf(va('sys.x')) === 'naming.prefix.not-for-variable', 'sys. 不能用作变量')
  assert(codeOf(va('g_old')) === 'naming.legacy-prefix', 'g_ 遗留变量名被拦截')
  const mqv = va('mqv_local')
  assert(mqv?.level === 'warn' && mqv.code === 'naming.mqtt-var.requires-machine', 'mqv_ 变量给出「须绑机器」警告')

  assert(isBroadcastEvent(SERVER_POLICY, 'ge_alarm'), 'ge_ 判定为广播事件')
  assert(!isBroadcastEvent(SERVER_POLICY, 'mqe_topic'), 'mqe_ 不是广播事件')
  assert(isReservedRouteEvent(SERVER_POLICY, 'ge_alarm'), 'ge_ 禁止路由匹配')
  assert(isReservedRouteEvent(SERVER_POLICY, 't_tick'), 't_ 禁止路由匹配')
  assert(isReservedRouteEvent(SERVER_POLICY, 'sys.changed.x'), 'sys. 禁止路由匹配')
  assert(isReservedRouteEvent(SERVER_POLICY, 'delay1s_a_to_b'), '内部延迟事件禁止路由匹配')
  assert(!isReservedRouteEvent(SERVER_POLICY, 'mqe_topic'), 'mqe_ 可被路由（边界事件）')
  assert(!isReservedRouteEvent(SERVER_POLICY, 'alarm'), '普通事件可被路由')
}

console.log('── B) 自定义策略注入 ──')
{
  const custom: NamingPolicy = {
    key: 'custom',
    namespaces: [
      { key: 'appVar', prefix: 'av_', event: 'block', variable: 'allow' },
      { key: 'appEvent', prefix: 'ae_', event: 'allow', variable: 'block', broadcast: true },
      { key: 'reserved', prefix: 'x.', event: 'block', variable: 'block' },
    ],
  }
  assert(checkEventName(custom, 'av_count')?.code === 'naming.prefix.not-for-event', 'av_ 不能用作事件')
  assert(checkEventName(custom, 'ae_boot') === null, 'ae_ 可作为事件')
  assert(checkEventName(custom, 'x.audit')?.code === 'naming.prefix.not-for-event', '自定义保留前缀生效')
  assert(checkEventName(custom, 'gv_count') === null, '自定义策略下 gv_ 不再特殊（证明未硬编码）')
  assert(checkVarName(custom, 'av_count') === null, 'av_ 可作为变量')
  assert(checkVarName(custom, 'ae_boot')?.code === 'naming.prefix.not-for-variable', 'ae_ 不能用作变量')
  assert(isBroadcastEvent(custom, 'ae_boot'), '自定义 broadcast 命名空间生效')
}

console.log('── C) BASE_POLICY ──')
{
  assert(BASE_POLICY.key === 'base', 'BASE_POLICY.key = base')
  assert(checkEventName(BASE_POLICY, 'gv_count') === null, 'BASE_POLICY 不认识 gv_')
  assert(checkEventName(BASE_POLICY, 't_tick') === null, 'BASE_POLICY 不认识 t_')
  assert(checkVarName(BASE_POLICY, 'anything') === null, 'BASE_POLICY 不限制普通变量')
  assert(checkEventName(BASE_POLICY, '')?.code === 'naming.empty', '空事件名仍被拦截')
}

console.log('── D) 自动延迟事件 ──')
{
  const doc = emptyDoc('auto-delay')
  const a = newUid()
  const b = newUid()
  doc.states = [
    { uid: a, id: 'a', label: 'a', kind: 'atomic', parent: null, initial: null, entryActions: [], exitActions: [] },
    { uid: b, id: 'b', label: 'b', kind: 'atomic', parent: null, initial: null, entryActions: [], exitActions: [] },
  ]
  doc.transitions = [{ id: 't1', source: a, target: b, event: 'delay5s_a_to_b', cond: '', actions: [], delayMs: 5000, delayUnit: 's' }]
  assert(checkEventName(SERVER_POLICY, 'delay5s_a_to_b')?.code === 'naming.auto-delay', '无文档上下文时自动延迟名被拦截')
  assert(checkEventName(SERVER_POLICY, 'delay5s_a_to_b', { doc }) === null, '已被转移引用的自动延迟名放行')
}

console.log('── E) 部署闸门（doc 级定位）──')
{
  const mkState = (id: string, entry: string[] = [], exit: string[] = []): StateNode => ({
    uid: newUid(),
    id,
    label: id,
    kind: 'atomic',
    parent: null,
    initial: null,
    entryActions: entry,
    exitActions: exit,
  })
  const docWith = (patch: (d: ProjectDoc) => void): ProjectDoc => {
    const d = emptyDoc('gate')
    d.states = [mkState('idle')]
    d.initial = d.states[0]!.uid
    patch(d)
    return d
  }

  const badVar = docWith((d) => {
    d.datamodel = [{ id: 'g_old', expr: '0' }]
  })
  const varIssue = checkDocNaming(SERVER_POLICY, badVar)
  assert(varIssue?.code === 'naming.legacy-prefix' && varIssue.target.kind === 'datamodel', 'datamodel 的 g_ 被拦截并定位到 index')

  const badSend = docWith((d) => {
    d.states[0]!.entryActions = ['send t_tick']
  })
  const sendIssue = checkDocNaming(SERVER_POLICY, badSend)
  assert(
    sendIssue?.code === 'naming.send.reserved' &&
      sendIssue.target.kind === 'state' &&
      sendIssue.target.slot === 'entry' &&
      sendIssue.target.actionIndex === 0,
    'send t_ 被拦截并定位到 entry/动作行',
  )

  const badAssign = docWith((d) => {
    d.states[0]!.exitActions = ['assign g_count = 1']
  })
  const assignIssue = checkDocNaming(SERVER_POLICY, badAssign)
  assert(assignIssue?.code === 'naming.assign.forbidden', 'assign 到 g_ 被拦截')

  const badTransition = docWith((d) => {
    d.transitions = [{ id: 't1', source: d.states[0]!.uid, target: d.states[0]!.uid, event: 'g_old', cond: '', actions: [] }]
  })
  const transitionIssue = checkDocNaming(SERVER_POLICY, badTransition)
  assert(
    transitionIssue?.code === 'naming.transition.legacy' &&
      transitionIssue.target.kind === 'transition' &&
      transitionIssue.target.event === 'g_old',
    '转移事件 g_ 被拦截并定位到转移',
  )

  const okDoc = docWith((d) => {
    d.datamodel = [{ id: 'gv_count', expr: '0' }]
    d.states[0]!.entryActions = ['send ge_boot', 'send mqe_topic']
    d.transitions = [
      { id: 't1', source: d.states[0]!.uid, target: d.states[0]!.uid, event: 'sys.changed.count', cond: '', actions: [] },
    ]
  })
  assert(checkDocNaming(SERVER_POLICY, okDoc) === null, '合法文档通过闸门（监听 sys. 合法、mqe_ send 合法）')
}

console.log('── F) 策略驱动迁移 ──')
{
  const legacy: ProjectDoc = {
    formatVersion: 1,
    name: 'legacy',
    initial: null,
    datamodel: [{ id: 'g_temp', expr: 'g_temp + 1' }],
    states: [
      {
        uid: 's1',
        id: 'idle',
        label: 'idle',
        kind: 'atomic',
        parent: null,
        initial: null,
        entryActions: ['send g_tick_1s delay 1s id tick', 'assign g_count = g_count + 1'],
        exitActions: ['log g_temp'],
      },
    ],
    transitions: [{ id: 't1', source: 's1', target: 's1', event: 'g_changed.temp', cond: 'g_temp > 0', actions: [] }],
    layout: {},
  }
  const migrated = migrateDoc(SERVER_POLICY, legacy)
  assert(migrated.doc.datamodel[0]!.id === 'gv_temp', '变量 g_temp → gv_temp')
  assert(migrated.doc.datamodel[0]!.expr === 'gv_temp + 1', '变量表达式 g_temp → gv_temp')
  assert(migrated.doc.states[0]!.entryActions[0] === 'send t_1s delay 1s id tick', 'g_tick_1s → t_1s')
  assert(migrated.doc.states[0]!.entryActions[1] === 'assign gv_count = gv_count + 1', 'assign 目标与表达式迁移')
  assert(migrated.doc.states[0]!.exitActions[0] === 'log gv_temp', 'log 表达式迁移')
  assert(migrated.doc.transitions[0]!.event === 'sys.changed.temp', 'g_changed.temp → sys.changed.temp')
  assert(migrated.doc.transitions[0]!.cond === 'gv_temp > 0', 'cond 表达式迁移')
  assert(legacy.datamodel[0]!.id === 'g_temp', '迁移不修改输入文档')
  assert(migrated.changes > 0, `统计改动字段数 = ${migrated.changes}`)
  assert(migrateEventName(SERVER_POLICY, 'g_plain') === 'ge_plain', '普通事件 g_ → ge_')
  assert(migrateVarName(SERVER_POLICY, 'gv_keep') === 'gv_keep', '已是 v2 的变量名不变')
  assert(migrateExpr(SERVER_POLICY, 'ge_x + gv_y') === 'ge_x + gv_y', '已是 v2 的表达式不变')
  assert(migrateEventName(BASE_POLICY, 'g_plain') === 'g_plain', '无迁移钩子时恒等')
}

console.log('── G) 静态守卫：core 不硬编码服务端前缀 ──')
{
  const here = dirname(fileURLToPath(import.meta.url))
  const coreDir = resolve(here, '../src/core')
  const files = readdirSync(coreDir).filter((f) => f.endsWith('.ts'))
  const offenders: string[] = []
  for (const f of files) {
    if (f === 'examples.ts') continue // 示例数据可以包含演示用前缀
    const src = readFileSync(join(coreDir, f), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    if (/\b(gv_|ge_|mqe_|mqv_|sys\.)/.test(code) || /'t_'/.test(code) || /'g_'/.test(code)) {
      offenders.push(f)
    }
  }
  assert(offenders.length === 0, `core 源码未硬编码服务端前缀（违规：${offenders.join(', ') || '无'}）`)
  const serverSrc = readFileSync(resolve(here, './fixtures/server-policy.ts'), 'utf8')
  assert(/gv_/.test(serverSrc) && /sys\./.test(serverSrc), 'SERVER_POLICY 确实持有服务端前缀（守卫非空跑）')
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
