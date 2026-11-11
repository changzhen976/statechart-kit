/**
 * SCXML 导入 roundtrip 验证：全部内置示例 serialize → import → serialize
 * 逐字节相等（自产 SCXML 无损往返）。运行：npm run test:import
 */
import { Window } from 'happy-dom'
import { EXAMPLES } from '../src/core/examples'
import { emptyDoc, newUid, type DoneData, type ProjectDoc } from '../src/core/model'
import { serializeToScxml } from '../src/core/serializer'
import { scxmlToDoc, type ImportWarning } from '../src/core/scxml-import'

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

const domParser = new (new Window().DOMParser)() as unknown as DOMParser

console.log('── 通用变量/事件属性 roundtrip ──')
{
  const doc = emptyDoc('attrs')
  doc.datamodel = [{ id: 'temp', expr: '0', attrs: { global: true, scope: 'shared' } }]
  doc.eventAttrs = { ping: { broadcast: true, route: 'flow' } }
  doc.states = [
    {
      uid: 's1',
      id: 'a',
      label: 'a',
      kind: 'atomic',
      parent: null,
      initial: null,
      entryActions: [],
      exitActions: [],
    },
  ]
  doc.initial = 's1'
  const xml = serializeToScxml(doc)
  const back = scxmlToDoc(xml, domParser).doc
  assert(back.datamodel[0]?.attrs?.global === true && back.datamodel[0]?.attrs?.scope === 'shared', 'DataVar.attrs 经 SCXML roundtrip 保留')
  assert(back.eventAttrs?.ping?.broadcast === true && back.eventAttrs?.ping?.route === 'flow', 'eventAttrs 经 SCXML roundtrip 保留')
}

function finalDoc(doneData: DoneData): ProjectDoc {
  const doc = emptyDoc('done-data')
  const u = newUid()
  doc.states = [
    {
      uid: u,
      id: 'done',
      label: 'done',
      kind: 'final',
      parent: null,
      initial: null,
      entryActions: [],
      exitActions: [],
      doneData,
    },
  ]
  doc.initial = u
  return doc
}

console.log('── final <donedata> roundtrip ──')
for (const [name, doneData] of [
  ['expr', { expr: "'ok'" }],
  ['content', { content: '{"a":1}' }],
  ['params', { params: [{ name: 'x', expr: '42' }, { name: 'y', expr: "'yes'" }] }],
] as [string, DoneData][]) {
  const doc1 = finalDoc(doneData)
  const xml1 = serializeToScxml(doc1)
  const r = scxmlToDoc(xml1, domParser)
  const xml2 = serializeToScxml(r.doc)
  assert(r.warnings.length === 0, `${name}：导入无警告`)
  assert(r.doc.states[0]?.doneData !== undefined, `${name}：donedata 保留`)
  assert(xml1 === xml2, `${name}：serialize(import(serialize)) 逐字节相等`)
}

console.log('── 无 target 的内部转移 ──')
{
  const doc1 = emptyDoc('internal')
  const a = newUid()
  const b = newUid()
  doc1.states = [
    { uid: a, id: 'a', label: 'a', kind: 'atomic', parent: null, initial: null, entryActions: [], exitActions: [] },
    { uid: b, id: 'b', label: 'b', kind: 'atomic', parent: null, initial: null, entryActions: [], exitActions: [] },
  ]
  doc1.initial = a
  doc1.transitions = [
    {
      id: 't-internal',
      source: a,
      target: null,
      transitionType: 'internal',
      event: 'cell.start',
      cond: '',
      actions: ['send cell.ready'],
    },
  ]
  const xml1 = serializeToScxml(doc1)
  const r = scxmlToDoc(xml1, domParser)
  const t = r.doc.transitions[0]
  assert(t?.target === null && t.transitionType === 'internal', 'targetless + type=internal 保留')
  assert(t?.actions[0] === 'send cell.ready', 'targetless 的动作保留')
  assert(!r.warnings.some((w) => w.code === 'import.transition.no-target'), '不再产生 no-target 警告')
  assert(xml1 === serializeToScxml(r.doc), 'targetless：serialize(import(serialize)) 逐字节相等')
}

console.log('── 外部 SCXML：donedata + targetless ──')
{
  const r = scxmlToDoc(
    `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="a"><transition event="cell.start"><send event="cell.ready"/></transition></state>
      <final id="done"><donedata><content expr="'ok'"/></donedata></final>
    </scxml>`,
    domParser,
  )
  assert(r.doc.transitions[0]?.target === null, '外部 targetless 转移被保留')
  assert(r.doc.states.find((s) => s.id === 'done')?.doneData?.expr === "'ok'", '外部 donedata 被保留')
  assert(!r.warnings.some((w) => w.code === 'import.element.unsupported'), 'donedata 不再报 unsupported')
  assert(!r.warnings.some((w) => w.code === 'import.transition.no-target'), 'targetless 不再报 no-target')
}

console.log('── 外部 SCXML：type="internal" 带 target ──')
{
  const r = scxmlToDoc(
    `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="s">
      <state id="s" initial="a">
        <state id="a"/>
        <state id="b"/>
        <transition event="go" type="internal" target="b"/>
      </state>
    </scxml>`,
    domParser,
  )
  const t = r.doc.transitions[0]
  assert(t?.target !== null && t.transitionType === 'internal', '带 target 的 type=internal 保留')
  assert(serializeToScxml(r.doc).includes('type="internal"'), '序列化保留 type=internal')
}

console.log('── SCXML 导入 roundtrip（serialize → import → serialize） ──')
for (const ex of EXAMPLES) {
  const doc1 = ex.make()
  const xml1 = serializeToScxml(doc1)
  let doc2
  let warnings: ImportWarning[] = []
  try {
    const r = scxmlToDoc(xml1, domParser)
    doc2 = r.doc
    warnings = r.warnings
  } catch (e) {
    assert(false, `${ex.name}：导入抛错 ${e instanceof Error ? e.message : e}`)
    continue
  }
  if (warnings.length) {
    console.warn(`  ⚠ ${ex.name} 导入警告：`, warnings)
  }
  // 结构断言（uid 无关）
  const statesOk =
    doc2.states.length === doc1.states.length &&
    doc2.transitions.length === doc1.transitions.length &&
    doc2.datamodel.length === doc1.datamodel.length
  // 逐字节断言：二次序列化应与第一次完全一致
  const xml2 = serializeToScxml(doc2)
  assert(statesOk, `${ex.name}：状态/转移/变量数量一致（${doc2.states.length}/${doc2.transitions.length}/${doc2.datamodel.length}）`)
  assert(xml1 === xml2, `${ex.name}：serialize(import(serialize)) 逐字节相等`)
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
