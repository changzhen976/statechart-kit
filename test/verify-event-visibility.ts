/**
 * 0.13 事件可见性：
 *   A. raise / internal-only 守卫：内部触发、外部同名事件被拦截
 *   B. 自动延时是 external 类型，不能被 internal 守卫误杀
 *   C. serialize → import → serialize round-trip 保留可见性
 *   D. event catalog 通道与混合事件 warning
 *
 * 运行：npm run test:visibility
 */
import { Window } from 'happy-dom'
import type { DOMParserLike } from '@tinyactors/scxmljs/trusted'
import { emptyDoc, type StateNode, type TransitionEdge } from '../src/core/model'
import { serializeToDisplayScxml, serializeToScxml, actionLineToScxml } from '../src/core/serializer'
import { actionToLine, parseActionLine } from '../src/core/action-parse'
import { scxmlToDoc } from '../src/core/scxml-import'
import { docEventFacts } from '../src/core/event-catalog'
import { validateStructure } from '../src/core/validate-structure'
import { SessionRunner } from '../src/engine/session-runner'

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

const window = new Window()
const domParser = new window.DOMParser() as unknown as DOMParserLike

function node(uid: string, id: string, entryActions: string[] = []): StateNode {
  return { uid, id, label: id, kind: 'atomic', parent: null, entryActions, exitActions: [] }
}
function edge(source: string, target: string, event: string, extra: Partial<TransitionEdge> = {}): TransitionEdge {
  return { id: `t-${event}`, source, target, event, cond: '', actions: [], ...extra }
}

console.log('── 0) raise 动作 DSL ──')
{
  const parsed = parseActionLine('raise internal.go')
  assert(parsed.type === 'raise' && parsed.event === 'internal.go', 'raise 动作可解析')
  assert(actionToLine(parsed) === 'raise internal.go', 'raise 动作可往返')
  assert(actionLineToScxml('raise internal.go') === '<raise event="internal.go"/>', 'raise 动作可序列化')
}

console.log('── A) internal-only：raise 可触发，外部同名事件被拦截 ──')
{
  const doc = emptyDoc('internal')
  doc.states = [node('a', 'a', ['raise go']), node('b', 'b')]
  doc.initial = 'a'
  doc.transitions = [edge('a', 'b', 'go')]
  doc.eventVisibility = { go: 'internal' }
  const xml = serializeToScxml(doc)
  assert(xml.includes('data-kit-visibility="internal"'), '序列化写入 visible 元数据')
  assert(!serializeToDisplayScxml(doc).includes('data-kit-visibility'), '画布展示序列化隐藏实现守卫')
  assert(xml.includes("_event.type === 'internal'"), '序列化写入 SCXML 标准守卫')

  const runner = new SessionRunner({ engine: 'trusted', domParser })
  const events: string[] = []
  runner.on((e) => { if (e.type === 'active') events.push(e.ids.join(',')) })
  await runner.start(xml)
  await runner.settled()
  assert(events.includes('b'), '内部 raise 触发 internal-only 转移')
  await runner.stop()
}
{
  const doc = emptyDoc('external-blocked')
  doc.states = [node('a', 'a'), node('b', 'b')]
  doc.initial = 'a'
  doc.transitions = [edge('a', 'b', 'go')]
  doc.eventVisibility = { go: 'internal' }
  const runner = new SessionRunner({ engine: 'trusted', domParser })
  const events: string[] = []
  runner.on((e) => { if (e.type === 'active') events.push(e.ids.join(',')) })
  await runner.start(serializeToScxml(doc))
  await runner.settled()
  runner.send('go')
  await runner.settled()
  assert(events.at(-1) === 'a', '外部同名事件不能触发 internal-only 转移')
  await runner.stop()
}

console.log('── B) 自动延时保持 external，不被守卫误杀 ──')
{
  const doc = emptyDoc('delay')
  doc.states = [node('a', 'a'), node('b', 'b')]
  doc.initial = 'a'
  doc.transitions = [edge('a', 'b', 'auto.go', { delayMs: 20, delayUnit: 'ms' })]
  doc.eventVisibility = { 'auto.go': 'internal' }
  const xml = serializeToScxml(doc)
  assert(!xml.includes('data-kit-visibility="internal"'), '自动延时转移不写 internal 守卫')
  const runner = new SessionRunner({ engine: 'trusted', domParser })
  const events: string[] = []
  runner.on((e) => { if (e.type === 'active') events.push(e.ids.join(',')) })
  await runner.start(xml)
  await new Promise((r) => setTimeout(r, 80))
  await runner.settled()
  assert(events.includes('b'), '自动延时转移仍然触发')
  await runner.stop()
}

console.log('── C) round-trip 保留 raise / visibility / 条件 ──')
{
  const doc = emptyDoc('roundtrip')
  doc.states = [node('a', 'a', ['raise go']), node('b', 'b')]
  doc.initial = 'a'
  doc.transitions = [edge('a', 'b', 'go', { cond: 'x > 0' })]
  doc.eventVisibility = { go: 'internal' }
  const xml = serializeToScxml(doc)
  const imported = scxmlToDoc(xml, domParser as unknown as DOMParser)
  assert(imported.doc.states[0]?.entryActions[0] === 'raise go', '导入保留 raise 动作')
  assert(imported.doc.eventVisibility?.go === 'internal', '导入恢复事件可见性')
  assert(imported.doc.transitions[0]?.cond === 'x > 0', '导入剥离生成守卫、恢复用户条件')
  assert(serializeToScxml(imported.doc) === xml, 'serialize → import → serialize 逐字节一致')
}

console.log('── D) event facts channel 与混合可见性 warning ──')
{
  const doc = emptyDoc('facts')
  doc.states = [node('a', 'a', ['raise go']), node('b', 'b')]
  doc.initial = 'a'
  doc.transitions = [
    edge('a', 'b', 'go'),
    edge('a', 'b', 'timer', { delayMs: 20, delayUnit: 'ms' }),
  ]
  const facts = docEventFacts(doc)
  assert(facts.sendOrigins.get('go')?.[0]?.channel === 'internal', 'raise 来源标记为 internal')
  assert(facts.sendOrigins.get('timer')?.[0]?.channel === 'auto-delay', '自动延时来源标记为 auto-delay')

  doc.transitions.push(edge('a', 'b', 'go both', { id: 't-mixed' }))
  doc.eventVisibility = { go: 'internal' }
  const report = validateStructure(doc)
  assert(
    report.issues.some((i) => i.code === 'structure.transition.mixed-event-visibility'),
    '混合事件可见性产生 warning',
  )
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
