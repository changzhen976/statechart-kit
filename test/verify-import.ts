/**
 * SCXML 导入 roundtrip 验证：全部内置示例 serialize → import → serialize
 * 逐字节相等（自产 SCXML 无损往返）。运行：npm run test:import
 */
import { Window } from 'happy-dom'
import { EXAMPLES } from '../src/core/examples'
import { emptyDoc } from '../src/core/model'
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
