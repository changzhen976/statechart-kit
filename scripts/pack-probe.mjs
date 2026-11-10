/**
 * 在临时消费目录里跑的最小探针：只用裸包名导入，验证 exports map 与产物可用。
 * 由 scripts/check-pack.mjs 复制到临时目录后执行。
 */
const core = await import('statechart-kit')
const engine = await import('statechart-kit/engine')
const policies = await import('statechart-kit/policies/server')

const requiredCore = [
  'emptyDoc',
  'serializeToScxml',
  'scxmlToDoc',
  'parseActionLine',
  'actionToLine',
  'checkEventName',
  'checkVarName',
  'validateStructure',
  'docEventFacts',
  'migrateDoc',
  'truncateText',
]
const missing = requiredCore.filter((name) => typeof core[name] !== 'function')
if (missing.length) throw new Error(`core 缺少导出：${missing.join(', ')}`)
if (typeof core.BASE_POLICY !== 'object') throw new Error('core 缺少 BASE_POLICY 导出')
if (typeof engine.SessionRunner !== 'function') throw new Error('engine 缺少 SessionRunner 导出')
if (typeof engine.loadEngine !== 'function' || typeof engine.createEngineSession !== 'function') {
  throw new Error('engine 缺少懒加载器导出')
}
if (typeof engine.validateDocument !== 'function') throw new Error('engine 缺少 validateDocument 导出')
if (typeof policies.SERVER_POLICY !== 'object') throw new Error('policies/server 缺少 SERVER_POLICY 导出')

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

// 结构校验与策略注入在发布物里可用
const report = core.validateStructure(doc)
if (!report.ok) throw new Error(`validateStructure 拒绝了探针文档：${JSON.stringify(report.issues)}`)
const reserved = core.checkEventName(policies.SERVER_POLICY, 't_tick')
if (reserved?.code !== 'naming.prefix.not-for-event') {
  throw new Error(`SERVER_POLICY 未拦截 t_：${JSON.stringify(reserved)}`)
}
if (core.checkEventName(core.BASE_POLICY, 't_tick') !== null) {
  throw new Error('BASE_POLICY 不应认识服务端前缀')
}

// 动态 import 在真实解包目录里可解析（P2 懒加载器）
await engine.loadEngine('trusted')
await engine.loadEngine('sandboxed').then((mod) => {
  if (typeof mod.createSession !== 'function') throw new Error('sandboxed 模块缺少 createSession')
})

console.log(
  `probe ok: core ${requiredCore.length} exports, engine SessionRunner/validateDocument, ` +
    `policies/server SERVER_POLICY, xml ${xml.length} chars`,
)
