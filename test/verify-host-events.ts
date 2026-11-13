/**
 * 0.8 宿主运行时事件契约（SessionRunner）：
 * typed send(target/sendid)、done(data)、error(kind/message)，以及监听器隔离。
 *
 * 运行：npm run test:host-events
 */
import { Window } from 'happy-dom'
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom'
import { SessionRunner, type RunnerEvent } from '../src/engine/session-runner'
import { emptyDoc, newUid, type ProjectDoc } from '../src/core/model'
import { serializeToScxml } from '../src/core/serializer'

let pass = 0
let fail = 0
function assert(cond: unknown, msg: string): asserts cond {
  if (cond) {
    pass++
    console.log('  OK', msg)
  } else {
    fail++
    console.error('  FAIL:', msg)
  }
}

const w = new Window()
const domParser = new w.DOMParser()
const xmlDomParser = new XmlDOMParser() as unknown as typeof domParser as unknown as ConstructorParameters<typeof SessionRunner>[0] extends infer O
  ? O extends { domParser?: infer D }
    ? D
    : never
  : never

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const xmlOpen = (body: string): string =>
  `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript">${body}</scxml>`

function collect(runner: SessionRunner): RunnerEvent[] {
  const events: RunnerEvent[] = []
  runner.on((e) => events.push(e))
  return events
}

console.log('── 1) typed send：target/sendid/default ──')
{
  const runner = new SessionRunner({ domParser })
  const events = collect(runner)
  await runner.start(
    xmlOpen(`
      <state id="a">
        <transition event="go" target="f">
          <send event="internal" target="#_internal"/>
          <send event="outside"/>
        </transition>
      </state>
      <final id="f"/>
    `),
  )
  runner.send('go')
  await runner.settled()
  const sends = events.filter((e) => e.type === 'send')
  assert(sends.length === 2, `一次宏步产生 2 个 typed send（实际 ${sends.length}）`)
  assert(sends[0]?.type === 'send' && sends[0].target === '#_internal' && sends[0].sendid === undefined, '显式内部 target 透传，匿名 sendid 为 undefined')
  assert(sends[1]?.type === 'send' && sends[1].target === '', '未声明 target 时为默认空串，不是 undefined')
  assert(sends[0]?.type === 'send' && sends[0].name === 'internal', 'send 事件名透传')
  await runner.stop()
}

console.log('── 2) 延时 send 的 sendid ──')
{
  const runner = new SessionRunner({ domParser })
  const events = collect(runner)
  await runner.start(
    xmlOpen(`
      <state id="a">
        <onentry><send event="later" delay="10ms" id="t1"/></onentry>
      </state>
    `),
  )
  await sleep(40)
  const delayed = events.find((e) => e.type === 'send' && e.name === 'later')
  assert(delayed?.type === 'send' && delayed.sendid === 't1', `延时 send 保留 sendid（${JSON.stringify(delayed)}）`)
  await runner.stop()
}

console.log('── 3) 序列化延时转移：自动事件名作为 sendid ──')
{
  const doc = emptyDoc('host-events-delay')
  const a = newUid('a')
  const b = newUid('b')
  doc.states = [
    { uid: a, id: 'a', label: 'a', kind: 'atomic', parent: null, initial: null, entryActions: [], exitActions: [] },
    { uid: b, id: 'b', label: 'b', kind: 'atomic', parent: null, initial: null, entryActions: [], exitActions: [] },
  ]
  doc.initial = a
  doc.transitions = [
    { id: 't1', source: a, target: b, event: 'delay10ms_a_to_b', cond: '', actions: [], delayMs: 10, delayUnit: 'ms' },
  ]
  const runner = new SessionRunner({ domParser })
  const events = collect(runner)
  await runner.start(serializeToScxml(doc))
  await sleep(40)
  const sends = events.filter((e) => e.type === 'send')
  assert(sends.some((e) => e.type === 'send' && e.sendid === 'delay10ms_a_to_b'), '延时转移展开的 send 带自动事件名 sendid')
  await runner.stop()
}

console.log('── 4) done：结构化 data 与状态 ──')
{
  const runner = new SessionRunner({ domParser })
  const events = collect(runner)
  await runner.start(
    xmlOpen(`
      <state id="a"><transition event="finish" target="done"/></state>
      <final id="done"><donedata><content expr="'ok'"/></donedata></final>
    `),
  )
  runner.send('finish')
  await runner.settled()
  const done = events.find((e) => e.type === 'done')
  assert(done?.type === 'done' && done.data === 'ok', `done.data 透传（${JSON.stringify(done)}）`)
  assert(runner.status === 'done' && runner.running === true, 'done 后 status=done，但 runner 仍持有会话')
  await runner.stop()
}

console.log('── 4b) done 无 donedata：data 为 undefined ──')
{
  const runner = new SessionRunner({ domParser })
  const events = collect(runner)
  await runner.start(xmlOpen(`<final id="only"/>`))
  await runner.settled()
  const done = events.find((e) => e.type === 'done')
  assert(done?.type === 'done' && done.data === undefined, '无 donedata 时 done.data=undefined')
  await runner.stop()
}

console.log('── 4c) targetless 内部转移：动作执行且状态不变 ──')
{
  const runner = new SessionRunner({ domParser })
  await runner.start(
    xmlOpen(`
      <datamodel><data id="n" expr="0"/></datamodel>
      <state id="a">
        <transition event="tick" type="internal"><assign location="n" expr="n+1"/></transition>
        <transition event="go" target="b"/>
      </state>
      <state id="b"/>
    `),
  )
  runner.send('tick')
  await runner.settled()
  assert(runner.snapshot().n === 1, 'targetless 转移执行 assign')
  assert(runner.activeStateIds().includes('a') && !runner.activeStateIds().includes('b'), 'targetless 转移不退出源状态')
  await runner.stop()
}

console.log('── 4d) donedata content/param 形状 ──')
{
  for (const [label, body, expected] of [
    ['content 文本', '<donedata><content>{"a":1}</content></donedata>', { a: 1 }],
    ['param', '<donedata><param name="x" expr="42"/></donedata>', { x: 42 }],
  ] as const) {
    const runner = new SessionRunner({ domParser })
    const events = collect(runner)
    await runner.start(
      xmlOpen(`<state id="a"><transition event="finish" target="done"/></state><final id="done">${body}</final>`),
    )
    runner.send('finish')
    await runner.settled()
    const done = events.find((e) => e.type === 'done')
    assert(
      done?.type === 'done' && JSON.stringify(done.data) === JSON.stringify(expected),
      `${label}：done.data 形状正确（${JSON.stringify(done?.data)}）`,
    )
    await runner.stop()
  }
}


console.log('── 4e) done.states 与终态 active ──')
{
  const runner = new SessionRunner({ domParser })
  const events = collect(runner)
  await runner.start(
    xmlOpen(`<state id="a"><transition event="finish" target="done"/></state><final id="done"/>`),
  )
  runner.send('finish')
  await runner.settled()
  const done = events.find((e) => e.type === 'done')
  assert(done?.type === 'done' && done.states.includes('done'), `done.states 包含终态（${JSON.stringify(done?.states)}）`)
  const doneAt = events.indexOf(done!)
  const after = events.slice(doneAt + 1)
  assert(!after.some((e) => e.type === 'active' && e.ids.length === 0), 'done 后不再发送空 active')
  assert(events.some((e) => e.type === 'active' && e.ids.includes('done')), '终态 active 仍可在 done 前观察到')
  await runner.stop()
}

console.log('── 4f) error 角标：state/slot/action/transition ──')
{
  const runner = new SessionRunner({ domParser, engine: 'trusted' })
  const events = collect(runner)
  await runner.start(
    xmlOpen(`
      <state id="a">
        <onentry><script>throw new Error('entry boom')</script></onentry>
        <transition event="go" target="b" data-kit-transition-id="t-test">
          <script>throw new Error('transition boom')</script>
        </transition>
      </state>
      <state id="b"/>
    `),
  )
  await runner.settled()
  const entryError = events.find((e) => e.type === 'error')
  assert(
    entryError?.type === 'error' &&
      entryError.stateId === 'a' &&
      entryError.slot === 'entry' &&
      entryError.actionIndex === 0 &&
      entryError.element?.localName === 'script',
    `entry 错误定位（${JSON.stringify(entryError)}）`,
  )
  events.length = 0
  runner.send('go')
  await runner.settled()
  const transitionError = events.find((e) => e.type === 'error')
  assert(
    transitionError?.type === 'error' &&
      transitionError.stateId === 'a' &&
      transitionError.slot === 'transition' &&
      transitionError.transitionId === 't-test',
    `transition 错误定位（${JSON.stringify(transitionError)}）`,
  )
  await runner.stop()
}

console.log('── 4g) serializer 保留 transition 定位 id ──')
{
  const doc = emptyDoc('err')
  const a = { uid: newUid(), id: 'a', label: 'a', kind: 'atomic' as const, parent: null, entryActions: [], exitActions: [] }
  const b = { uid: newUid(), id: 'b', label: 'b', kind: 'atomic' as const, parent: null, entryActions: [], exitActions: [] }
  doc.states.push(a, b)
  doc.initial = a.uid
  const transitionId = newUid()
  doc.transitions.push({
    id: transitionId,
    source: a.uid,
    target: b.uid,
    event: 'go',
    cond: '',
    actions: ["throw new Error('serialized transition boom')"],
  })
  const runner = new SessionRunner({ domParser, engine: 'trusted' })
  const events = collect(runner)
  await runner.start(serializeToScxml(doc))
  runner.send('go')
  await runner.settled()
  const error = events.find((e) => e.type === 'error')
  assert(
    error?.type === 'error' && error.transitionId === transitionId && error.stateId === 'a',
    `serializer 产出的 transition id 可用于错误定位（${JSON.stringify(error)}）`,
  )
  await runner.stop()
}

console.log('── 4h) xmldom（Node 宿主）错误定位 ──')
{
  const runner = new SessionRunner({ domParser: xmlDomParser, engine: 'trusted' })
  const events = collect(runner)
  await runner.start(
    xmlOpen(`
      <state id="a">
        <onentry><script>throw new Error('xmldom entry boom')</script></onentry>
      </state>
    `),
  )
  await runner.settled()
  const error = events.find((e) => e.type === 'error')
  assert(
    error?.type === 'error' && error.stateId === 'a' && error.slot === 'entry',
    `xmldom 下仍能发出 error 定位（${JSON.stringify(error)}）`,
  )
  await runner.stop()
}

console.log('── 5) error：kind/message 结构化 ──')
{
  const runner = new SessionRunner({ domParser, engine: 'trusted' })
  const events = collect(runner)
  await runner.start(
    xmlOpen(`
      <state id="a">
        <onentry><script>throw new Error('boom')</script></onentry>
      </state>
    `),
  )
  await sleep(20)
  const error = events.find((e) => e.type === 'error')
  assert(error?.type === 'error' && /^error\./.test(error.kind), `error.kind 为 SCXML 错误类型（${JSON.stringify(error)}）`)
  assert(error?.type === 'error' && error.message.includes('boom'), 'error.message 含原始信息')
  await runner.stop()
}

console.log('── 6) send 与日志同源且监听器隔离 ──')
{
  const runner = new SessionRunner({ domParser })
  const sends: string[] = []
  const doneSeen: string[] = []
  runner.on(() => {
    throw new Error('bad listener')
  })
  runner.on((e) => {
    if (e.type === 'send') sends.push(e.name)
    if (e.type === 'done') doneSeen.push('done')
  })
  await runner.start(
    xmlOpen(`
      <state id="a">
        <transition event="go" target="f"><send event="ping"/></transition>
      </state>
      <final id="f"/>
    `),
  )
  runner.send('go')
  await runner.settled()
  assert(sends.join(',') === 'ping', '坏监听器不阻断 typed send')
  assert(doneSeen.length === 1, '坏监听器不阻断 typed done')
  await runner.stop()
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
