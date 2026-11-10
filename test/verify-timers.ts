/**
 * 内部延迟转移（after 语义）验证：
 *   A. 序列化展开：带 delayMs 的出边 → 源状态 entry(cancel → send delay id) / exit(cancel)
 *   B. roundtrip：serialize → import → serialize 逐字节相等 + delayMs/delayUnit 折回
 *   C. 行为（引擎 + VirtualClock.advance 增量快进）：
 *      - C1 flag=1：1s 判断转移 cond 通过先行 → 5s 超时转移被自动撤销
 *      - C2 flag=0：1s cond 不通过留在运行 → 5s 超时触发（用户场景的超时分支）
 *      - C3 提前退出 → 双撤销无触发（幽灵哨兵）；重入后 1s 再次触发
 *      - C4 双延迟转移独立时序
 *   D. autoDelayEventName（名称含延时(单位格式化)与端点；冲突加序号）
 * 注意：VirtualClock.run(until) 是**绝对时间**——增量快进必须用 advance(ms)。
 * 运行：npm run test:timers
 */
import { Window } from 'happy-dom'
import { createSession } from '@tinyactors/scxmljs'
import { VirtualClock } from '@tinyactors/scxmljs/trusted'
import { autoDelayEventName, emptyDoc, newUid, type ProjectDoc } from '../src/core/model'
import { serializeToScxml } from '../src/core/serializer'
import { scxmlToDoc } from '../src/core/scxml-import'

let pass = 0
let fail = 0
function assert(cond: unknown, msg: string): asserts cond {
  if (cond) {
    pass++
    console.error('  OK', msg)
  } else {
    fail++
    console.error('  FAIL:', msg)
  }
}

/** 待机 --开机--> 运行[双延迟转移：1s 判断(cond=flag) / 5s 超时]。
 *  待机另有 1s 延迟事件的自环哨兵（幽灵数）：若退出撤销失效，幽灵会落在待机并计数。 */
function timerDoc(flag: '0' | '1' = '0'): ProjectDoc {
  const doc = emptyDoc('timer-demo')
  doc.datamodel = [
    { id: 'flag', expr: flag },
    { id: '判断数', expr: '0' },
    { id: '超时数', expr: '0' },
    { id: '幽灵数', expr: '0' },
  ]
  const u待机 = newUid()
  const u运行 = newUid()
  const u判断 = newUid()
  const u超时 = newUid()
  doc.initial = u待机
  doc.states = [
    { uid: u待机, id: '待机', label: '待机', kind: 'atomic', parent: null, initial: null, entryActions: [], exitActions: [] },
    { uid: u运行, id: '运行', label: '运行', kind: 'atomic', parent: null, initial: null, entryActions: [], exitActions: [] },
    { uid: u判断, id: '判断', label: '判断', kind: 'atomic', parent: null, initial: null, entryActions: [], exitActions: [] },
    { uid: u超时, id: '超时', label: '超时', kind: 'atomic', parent: null, initial: null, entryActions: [], exitActions: [] },
  ]
  doc.transitions = [{ id: 't1', source: u待机, target: u运行, event: '开机', cond: '', actions: [] }]
  const ev1 = autoDelayEventName(doc, u运行, u判断, 1000, 's')
  doc.transitions.push({ id: 't2', source: u运行, target: u判断, event: ev1, cond: 'flag', actions: ['assign 判断数 = 判断数 + 1'], delayMs: 1000, delayUnit: 's' })
  const ev2 = autoDelayEventName(doc, u运行, u超时, 5000, 's')
  doc.transitions.push({ id: 't3', source: u运行, target: u超时, event: ev2, cond: '', actions: ['assign 超时数 = 超时数 + 1'], delayMs: 5000, delayUnit: 's' })
  // 幽灵哨兵：待机自环监听 1s 延迟事件——退出撤销失效时计数
  doc.transitions.push({ id: 't4', source: u待机, target: u待机, event: ev1, cond: '', actions: ['assign 幽灵数 = 幽灵数 + 1'] })
  // 重置出边：判断 → 待机（测试重入循环用）
  doc.transitions.push({ id: 't5', source: u判断, target: u待机, event: '重置', cond: '', actions: [] })
  // 复位：离开 运行（触发 exit 自动撤销双定时器）
  doc.transitions.push({ id: 't6', source: u运行, target: u待机, event: '复位', cond: '', actions: [] })
  return doc
}

const { window } = new Window()
const domParser = new window.DOMParser() as unknown as DOMParser

console.log('── A) 序列化展开（双延迟转移，单位 s） ──')
const doc1 = timerDoc()
const xml = serializeToScxml(doc1)
const ev1 = doc1.transitions[1]!.event
const ev2 = doc1.transitions[2]!.event
const reEntryAll = new RegExp(
  `<onentry>[\\s\\S]*<cancel sendid="${ev1}"/>[\\s\\S]*<cancel sendid="${ev2}"/>[\\s\\S]*<send event="${ev1}" delay="1s" id="${ev1}"/>[\\s\\S]*<send event="${ev2}" delay="5s" id="${ev2}"/>[\\s\\S]*</onentry>`,
)
assert(reEntryAll.test(xml), 'entry 含双 cancel（重入防御，先撤后挂）+ 双 send 带 id（delay 按 s 格式化）')
const reExitAll = new RegExp(
  `<onexit>[\\s\\S]*<cancel sendid="${ev1}"/>[\\s\\S]*<cancel sendid="${ev2}"/>[\\s\\S]*</onexit>`,
)
assert(reExitAll.test(xml), 'exit 含双 cancel（退出自动撤销）')
assert(!doc1.states[1]!.entryActions.length && !doc1.states[1]!.exitActions.length, 'doc 层 entry/exit 不存展开行（自动推导）')

console.log('── B) roundtrip（折叠 + delayUnit 折回） ──')
const r = scxmlToDoc(xml, domParser)
const runImported = r.doc.states.find((s) => s.id === '运行')
const t2i = r.doc.transitions.find((t) => t.delayMs === 1000)
const t3i = r.doc.transitions.find((t) => t.delayMs === 5000)
assert(
  t2i?.event === ev1 && t2i?.delayMs === 1000 && t2i?.delayUnit === 's' && t3i?.event === ev2 && t3i?.delayMs === 5000 && t3i?.delayUnit === 's',
  'import 折回 delayMs + delayUnit + 自动事件名（delay…s_源_to_目标）',
)
assert(runImported!.entryActions.length === 0 && runImported!.exitActions.length === 0, 'import 折叠后 entry/exit 不残留展开行')
const xml2 = serializeToScxml(r.doc)
assert(xml2 === xml, 'serialize(import(serialize)) 逐字节相等')

// ── C) 行为：引擎 + VirtualClock.advance（增量快进） ──
interface MiniSession {
  start(): void
  send(name: string): void
  settled(): Promise<void>
  isActive(id: string): boolean
  snapshot(): Record<string, unknown>
  dispose(): void
}
async function mkSession(doc?: ProjectDoc): Promise<{
  s: MiniSession
  clock: VirtualClock
  tick(ms: number): Promise<void>
}> {
  const clock = new VirtualClock()
  const w = new Window()
  const s = (await createSession(serializeToScxml(doc ?? timerDoc()), {
    domParser: new w.DOMParser() as unknown as Parameters<typeof createSession>[1] extends infer O
      ? O extends { domParser?: infer D }
        ? D
        : never
      : never,
    clock,
  })) as unknown as MiniSession
  s.start()
  return { s, clock, tick: async (ms) => { clock.advance(ms); await s.settled() } }
}
const cnt = (s: MiniSession): string =>
  '判断=' + JSON.stringify(s.snapshot()['判断数']) + ' 超时=' + JSON.stringify(s.snapshot()['超时数']) + ' 幽灵=' + JSON.stringify(s.snapshot()['幽灵数'])

console.log('── C) 行为（引擎 + VirtualClock.advance 增量快进） ──')
async function behavior(): Promise<void> {
  // C1：flag=1 → 1s 判断转移 cond 通过先行 → 离开后 5s 超时转移被自动撤销
  {
    const { s, tick } = await mkSession(timerDoc('1'))
    s.send('开机')
    await tick(100)
    assert(s.isActive('运行'), 'C1 开机后处于 运行（双延迟转移已挂）')
    await tick(1200)
    assert(s.isActive('判断'), 'C1 1s 延迟转移触发（flag=1 cond 通过）')
    await tick(6000)
    assert(s.snapshot()['超时数'] === 0, `C1 离开后 5s 超时被自动撤销（超时=${JSON.stringify(s.snapshot()['超时数'])}）`)
    s.dispose()
  }
  // C2：flag=0 → 1s cond 不通过留在 运行 → 5s 超时触发（用户场景的超时分支）
  {
    const { s, tick } = await mkSession(timerDoc('0'))
    s.send('开机')
    await tick(1200)
    assert(s.isActive('运行'), 'C2 1s cond=false 留在 运行')
    await tick(4500)
    assert(s.isActive('超时'), 'C2 5s 延迟转移触发进入 超时')
    assert(s.snapshot()['超时数'] === 1 && s.snapshot()['判断数'] === 0, `C2 超时恰好一次：${cnt(s)}`)
    s.dispose()
  }
  // C3：提前退出 → 双延迟转移自动撤销无触发（幽灵哨兵）；重入后 1s 再次触发（flag=1 可观测）
  {
    const { s, tick } = await mkSession(timerDoc('1'))
    s.send('开机')
    await tick(1200)
    assert(s.isActive('判断') && s.snapshot()['判断数'] === 1, 'C3 第一次进入：1s 判断触发（判断数=1）')
    s.send('重置')
    await tick(200)
    assert(s.isActive('待机'), 'C3 重置回 待机')
    s.send('开机')
    await tick(1200)
    assert(
      s.isActive('判断') && s.snapshot()['判断数'] === 2 && s.snapshot()['超时数'] === 0,
      `C3 重入后 1s 再次触发（判断数=2，超时=0 → ${cnt(s)}）`,
    )
    s.dispose()
  }
  // C4：双延迟转移独立时序（1s 先、5s 后，互不干扰）
  {
    const { s, tick } = await mkSession(timerDoc('0'))
    s.send('开机')
    await tick(1150)
    assert(s.isActive('运行') && s.snapshot()['判断数'] === 0, 'C4-a 1s cond=false 留在 运行')
    await tick(4000)
    assert(s.snapshot()['超时数'] === 1, `C4-b 5s 超时触发一次（${cnt(s)}）`)
    assert(s.snapshot()['判断数'] === 0, 'C4-c 全程判断未误触发')
    s.dispose()
  }
}
await behavior()

console.log('── D) autoDelayEventName（名称含延时(单位格式化)与端点；冲突加序号） ──')
const d2 = timerDoc()
const fresh8 = autoDelayEventName(d2, '运行', '超时', 800, 'ms')
assert(fresh8 === 'delay800ms_运行_to_超时', `不同延时 ms 格式化（实际 ${fresh8}）`)
const dup = autoDelayEventName(
  { ...d2, transitions: [...d2.transitions, { ...d2.transitions[1]!, event: fresh8 }] },
  '运行',
  '超时',
  800,
  'ms',
)
assert(dup === 'delay800ms_运行_to_超时_2', `同端点同延时冲突 → _2（实际 ${dup}）`)
const asSeconds = autoDelayEventName(d2, '运行', '待机', 8000, 's')
assert(asSeconds === 'delay8s_运行_to_待机', `s 单位整秒格式化（实际 ${asSeconds}）`)

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
