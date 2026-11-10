/**
 * 在临时消费目录里跑的最小探针：只用裸包名导入，验证 exports map 与产物可用。
 * 由 scripts/check-pack.mjs 复制到临时目录后执行。
 */
const core = await import('statechart-kit')
const engine = await import('statechart-kit/engine')

const requiredCore = [
  'emptyDoc',
  'serializeToScxml',
  'scxmlToDoc',
  'parseActionLine',
  'actionToLine',
  'checkEventName',
  'checkVarName',
  'truncateText',
]
const missing = requiredCore.filter((name) => typeof core[name] !== 'function')
if (missing.length) throw new Error(`core 缺少导出：${missing.join(', ')}`)
if (typeof engine.SessionRunner !== 'function') throw new Error('engine 缺少 SessionRunner 导出')

// 真的跑一次序列化，确认产物里的代码可用而不只是能 import
const doc = core.emptyDoc('probe')
doc.states.push({
  uid: 's1',
  id: 'idle',
  label: 'idle',
  kind: 'atomic',
  parent: null,
  initial: null,
  entryActions: [],
  exitActions: [],
})
doc.initial = 's1'
const xml = core.serializeToScxml(doc)
if (!xml.includes('<scxml')) throw new Error('serializeToScxml 未产出 <scxml>')
if (!xml.includes('id="idle"')) throw new Error('serializeToScxml 未写出状态 id')

console.log(`probe ok: core ${requiredCore.length} exports, engine SessionRunner, xml ${xml.length} chars`)
