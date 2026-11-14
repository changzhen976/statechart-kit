/**
 * 事件可见性（0.13–0.15）：
 *   A. raise / internal-only 守卫：内部触发、外部同名事件被拦截
 *   B. 自动延时是 external 类型，不能被 internal 守卫误杀
 *   C. serialize → import → serialize round-trip 保留可见性
 *   D. event catalog 通道与混合事件 error
 *   G. 0.15 模型 internalOnlyEvents / 根级元数据 / 旧字段迁移
 *   H. 生产端一致性校验：普通 send / delay / auto-delay / #_internal+delay
 *
 * 运行：npm run test:visibility
 */
import { Window } from 'happy-dom'
import type { DOMParserLike } from '@tinyactors/scxmljs/trusted'
import { emptyDoc, normalizeDoc, type ProjectDoc, type StateNode, type TransitionEdge } from '../src/core/model'
import { internalOnlyNames, isInternalOnlyEvent, setInternalOnlyEvent } from '../src/core/event-visibility'
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
  setInternalOnlyEvent(doc, 'go', true)
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
  setInternalOnlyEvent(doc, 'go', true)
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
  setInternalOnlyEvent(doc, 'auto.go', true)
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
  setInternalOnlyEvent(doc, 'go', true)
  const xml = serializeToScxml(doc)
  const imported = scxmlToDoc(xml, domParser as unknown as DOMParser)
  assert(imported.doc.states[0]?.entryActions[0] === 'raise go', '导入保留 raise 动作')
  assert(isInternalOnlyEvent(imported.doc, 'go'), '导入恢复仅内部事件')
  assert(imported.doc.transitions[0]?.cond === 'x > 0', '导入剥离生成守卫、恢复用户条件')
  assert(serializeToScxml(imported.doc) === xml, 'serialize → import → serialize 逐字节一致')
}

console.log('── D) event facts channel 与混合可见性 error ──')
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
  setInternalOnlyEvent(doc, 'go', true)
  const report = validateStructure(doc)
  assert(
    report.issues.some(
      (i) => i.code === 'structure.transition.mixed-event-visibility' && i.severity === 'error',
    ),
    '混合事件可见性产生 error',
  )
}


console.log('── E) 旧 external 元数据：导入降级为双向 ──')
{
  const xml = `<?xml version="1.0"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a">
  <state id="a">
    <transition event="go" target="b" data-kit-visibility="external" cond="_event.type === 'external'"/>
  </state>
  <state id="b"/>
</scxml>`
  const imported = scxmlToDoc(xml, domParser as unknown as DOMParser)
  assert(
    imported.warnings.some((w) => w.code === 'import.event-visibility-external-removed'),
    '旧 external 元数据给降级 warning',
  )
  assert(!isInternalOnlyEvent(imported.doc, 'go'), 'external 降级为双向')
  assert(imported.doc.transitions[0]?.cond === '', '导入剥离 external 守卫')
}

console.log('── F) send target="#_internal" ──')
{
  const line = 'send internal.go target #_internal'
  const parsed = parseActionLine(line)
  assert(
    parsed.type === 'send' && parsed.target === '#_internal',
    'send target #_internal 可解析',
  )
  assert(actionToLine(parsed) === line, 'send target #_internal 可往返')
  assert(
    actionLineToScxml(line) === '<send event="internal.go" target="#_internal"/>',
    'send target #_internal 可序列化',
  )
  const xml = `<?xml version="1.0"?><scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"><onentry><send event="internal.go" target="#_internal"/></onentry><transition event="go" target="b"/></state><state id="b"/></scxml>`
  const imported = scxmlToDoc(xml, domParser as unknown as DOMParser)
  assert(
    imported.doc.states[0]?.entryActions[0] === line,
    '导入保留 #_internal target',
  )
  const facts = docEventFacts(imported.doc)
  assert(facts.sendOrigins.get('internal.go')?.[0]?.channel === 'internal', '#_internal send 来源标记为 internal')
}

console.log('── G) 0.15 模型：internalOnlyEvents / 根级元数据 / 迁移 ──')
{
  const doc = emptyDoc('internal-api')
  doc.states = [node('a', 'a', ['raise sys.tick']), node('b', 'b')]
  doc.initial = 'a'
  doc.transitions = [edge('a', 'b', 'sys.tick')]
  setInternalOnlyEvent(doc, 'sys.tick', true)
  assert(isInternalOnlyEvent(doc, 'sys.tick'), 'setInternalOnlyEvent 写入新字段')
  assert(internalOnlyNames(doc).join(',') === 'sys.tick', 'internalOnlyNames 返回集合')
  const xml = serializeToScxml(doc)
  assert(xml.includes('data-kit-internal-events='), '序列化写入根级 data-kit-internal-events')
  assert(xml.includes('data-kit-visibility="internal"'), '转移级元数据仍写入')
  const imported = scxmlToDoc(xml, domParser as unknown as DOMParser)
  assert(isInternalOnlyEvent(imported.doc, 'sys.tick'), '导入恢复根级仅内部集合')
  assert(imported.doc.internalOnlyEvents?.[0] === 'sys.tick', '导入写入 internalOnlyEvents')
  assert(serializeToScxml(imported.doc) === xml, '根级元数据逐字节往返')
  setInternalOnlyEvent(doc, 'sys.tick', false)
  assert(
    !isInternalOnlyEvent(doc, 'sys.tick') && !doc.internalOnlyEvents,
    '取消后清空 internalOnlyEvents',
  )
}
{
  const legacy = emptyDoc('legacy') as ProjectDoc & {
    eventVisibility?: Record<string, string>
  }
  legacy.states = [node('a', 'a', ['raise go']), node('b', 'b')]
  legacy.initial = 'a'
  legacy.transitions = [edge('a', 'b', 'go')]
  legacy.eventVisibility = { go: 'internal', old: 'external' }
  const normalized = normalizeDoc(legacy)
  assert(
    normalized.internalOnlyEvents?.includes('go') && isInternalOnlyEvent(normalized, 'go'),
    'normalizeDoc 把旧 eventVisibility.internal 迁入 internalOnlyEvents',
  )
  assert(!legacy.eventVisibility, 'normalizeDoc 删除旧 eventVisibility 字段')
  assert(!isInternalOnlyEvent(normalized, 'old'), '旧 external 降级为双向')
}

console.log('── H) 生产端一致性校验 ──')
function makeInternalDoc(entryActions: string[], transitions: TransitionEdge[] = []) {
  const doc = emptyDoc('producer')
  doc.states = [node('a', 'a', entryActions), node('b', 'b')]
  doc.initial = 'a'
  doc.transitions = transitions.length ? transitions : [edge('a', 'b', 'go')]
  setInternalOnlyEvent(doc, 'go', true)
  return doc
}
{
  const report = validateStructure(makeInternalDoc(['raise go']))
  assert(report.ok, 'raise 生产者：internal-only 校验通过')
}
{
  const doc = makeInternalDoc(['send go'])
  const report = validateStructure(doc)
  const issue = report.issues.find((i) => i.code === 'structure.event.internal-only-with-external-producer')
  assert(
    !!issue && issue.severity === 'error' && issue.event === 'go' && issue.stateId === 'a' &&
      issue.slot === 'entry' && issue.actionIndex === 1,
    '普通 send 生产者：报 error 并定位到 entry 行',
  )
}
{
  const report = validateStructure(makeInternalDoc(['send go delay 1s id go']))
  assert(
    report.issues.some(
      (i) => i.code === 'structure.event.internal-only-with-external-producer' && i.severity === 'error',
    ),
    'send delay 生产者：报 error',
  )
}
{
  const doc = emptyDoc('auto-delay-producer')
  doc.states = [node('a', 'a'), node('b', 'b')]
  doc.initial = 'a'
  doc.transitions = [edge('a', 'b', 'delay20ms_a_to_b', { delayMs: 20, delayUnit: 'ms' })]
  setInternalOnlyEvent(doc, 'delay20ms_a_to_b', true)
  const report = validateStructure(doc)
  assert(
    report.issues.some(
      (i) => i.code === 'structure.event.internal-only-with-external-producer' && i.severity === 'error',
    ),
    'delayMs 自动事件不能被标仅内部',
  )
}
{
  const report = validateStructure(
    makeInternalDoc(['send go target #_internal delay 1s id go']),
  )
  assert(
    report.issues.some(
      (i) => i.code === 'structure.action.internal-delay-unsupported' && i.severity === 'error',
    ),
    '#_internal + delay：报 error',
  )
}
{
  const doc = emptyDoc('no-producer')
  doc.states = [node('a', 'a'), node('b', 'b')]
  doc.initial = 'a'
  doc.transitions = [edge('a', 'b', 'go')]
  setInternalOnlyEvent(doc, 'go', true)
  const report = validateStructure(doc)
  assert(
    report.issues.some(
      (i) => i.code === 'structure.event.internal-only-without-producer' && i.severity === 'warning',
    ),
    '无生产者：warning',
  )
}

console.log('── I) 导入根级集合优先级与 warning ──')
{
  const xml = `<?xml version="1.0"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a" data-kit-internal-events="not-json">
  <state id="a"><transition event="go" target="b"/></state>
  <state id="b"/>
</scxml>`
  const imported = scxmlToDoc(xml, domParser as unknown as DOMParser)
  assert(
    imported.warnings.some((w) => w.code === 'import.event-visibility-invalid'),
    '非法根级 JSON：warning 并退回转移级',
  )
}
{
  const xml = `<?xml version="1.0"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a" data-kit-internal-events='["go"]'>
  <state id="a">
    <transition event="other" target="b" data-kit-visibility="internal" cond="_event.type === 'internal'"/>
  </state>
  <state id="b"/>
</scxml>`
  const imported = scxmlToDoc(xml, domParser as unknown as DOMParser)
  assert(
    imported.warnings.some((w) => w.code === 'import.event-visibility-mismatch'),
    '根级与转移级不一致：warning',
  )
  assert(isInternalOnlyEvent(imported.doc, 'go'), '根级集合优先：go 为仅内部')
  assert(!isInternalOnlyEvent(imported.doc, 'other'), '根级集合优先：other 不继承转移元数据')
  assert(imported.doc.transitions[0]?.cond === '', '不一致时仍剥离生成的守卫')
}
{
  const xml = `<?xml version="1.0"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a" data-kit-internal-events='["go"]'>
  <state id="a"><transition event="other" target="b"/></state>
  <state id="b"/>
</scxml>`
  const imported = scxmlToDoc(xml, domParser as unknown as DOMParser)
  assert(
    !imported.warnings.some((w) => w.code === 'import.event-visibility-mismatch'),
    '根级有、转移级没有：不算不一致（事件可暂无监听者）',
  )
  assert(isInternalOnlyEvent(imported.doc, 'go'), '无监听的根级仅内部事件仍保留')
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
