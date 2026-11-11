/**
 * P1 校验分层验证：
 *   A. core `validateStructure`：合法文档通过；id/父子/initial/转移/延时错误可定位
 *   B. engine `validateAgainstEngine` / `validateDocument`：引擎 parse+compile、错误定位
 *   C. 分层边界：结构错误不跑引擎；命名错误在引擎前拦截
 *   D. 静态守卫：core 不 import 引擎
 *
 * 运行：npm run test:validation
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'
import type { DOMParserLike } from '@tinyactors/scxmljs/trusted'
import { extremeDemoDoc, trafficLightDoc } from '../src/core/examples'
import { emptyDoc, newUid, type ProjectDoc, type StateNode } from '../src/core/model'
import { validateStructure } from '../src/core/validate-structure'
import { DocumentStructureError, serializeChecked } from '../src/core/serialize-checked'
import { ScxmlImportError, scxmlToDoc } from '../src/core/scxml-import'
import { serializeToScxml } from '../src/core/serializer'
import { scanScriptActions } from '../src/core/action-parse'
import { SERVER_POLICY } from './fixtures/server-policy'
import {
  scriptHitsToIssues,
  validateAgainstEngine,
  validateDocument,
  validateScxml,
} from '../src/engine/validator'

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

const domParser = new (new Window().DOMParser)() as unknown as DOMParserLike

const st = (uid: string, id: string, kind: StateNode['kind'] = 'atomic', parent: string | null = null): StateNode => ({
  uid,
  id,
  label: id,
  kind,
  parent,
  initial: null,
  entryActions: [],
  exitActions: [],
})

function twoStateDoc(): ProjectDoc {
  const doc = emptyDoc('struct')
  const a = newUid()
  const b = newUid()
  doc.states = [st(a, 'a'), st(b, 'b')]
  doc.initial = a
  doc.transitions = [{ id: 't1', source: a, target: b, event: 'go', cond: '', actions: [] }]
  return doc
}

const codes = (doc: ProjectDoc): string[] => validateStructure(doc).issues.map((i) => i.code)

console.log('── A) validateStructure（core）──')
{
  assert(validateStructure(trafficLightDoc()).ok, '内置交通灯示例结构合法')
  assert(validateStructure(twoStateDoc()).ok, '两状态文档结构合法')

  const dup = twoStateDoc()
  dup.states[1]!.id = 'a'
  const dupReport = validateStructure(dup)
  assert(!dupReport.ok && dupReport.issues.some((i) => i.code === 'structure.state.duplicate-id'), '重复 state id 报错')

  const badId = twoStateDoc()
  badId.states[0]!.id = '1bad'
  assert(codes(badId).includes('structure.state.invalid-id'), '非法 state id 报错')

  const missingParent = twoStateDoc()
  missingParent.states[1]!.parent = 'nope'
  assert(codes(missingParent).includes('structure.state.missing-parent'), 'parent 指向不存在的 uid 报错')

  const cycle = twoStateDoc()
  cycle.states[0]!.parent = cycle.states[1]!.uid
  cycle.states[1]!.parent = cycle.states[0]!.uid
  cycle.initial = null
  assert(codes(cycle).includes('structure.state.parent-cycle'), '父子环报错')

  const nestedInitial = twoStateDoc()
  nestedInitial.initial = nestedInitial.states[1]!.uid
  nestedInitial.states[1]!.parent = nestedInitial.states[0]!.uid
  assert(codes(nestedInitial).includes('structure.root.initial-not-top'), '根 initial 指向嵌套状态报错')

  const historyRoot = twoStateDoc()
  historyRoot.states[1]!.kind = 'history'
  assert(codes(historyRoot).includes('structure.state.history-root'), '根级 history 伪态报错')

  const historyKid = twoStateDoc()
  const h = newUid()
  historyKid.states.push(st(h, 'h', 'history', historyKid.states[0]!.uid))
  historyKid.states.push(st(newUid(), 'kid', 'atomic', h))
  assert(codes(historyKid).includes('structure.state.history-children'), 'history 带子状态报错')

  const badTarget = twoStateDoc()
  badTarget.transitions[0]!.target = 'nope'
  assert(codes(badTarget).includes('structure.transition.missing-target'), '转移 target 不存在报错')

  const badDelay = twoStateDoc()
  badDelay.transitions[0]!.delayMs = 5
  assert(codes(badDelay).includes('structure.transition.delay-invalid'), 'delayMs < 10 报错')

  const fallback = twoStateDoc()
  const kid = newUid()
  fallback.states[0]!.kind = 'compound'
  fallback.states.push(st(kid, 'kid', 'atomic', fallback.states[0]!.uid))
  assert(codes(fallback).includes('structure.state.initial-fallback'), '复合状态无 initial → warning（序列化器回退第一个子状态）')

  const internal = twoStateDoc()
  internal.transitions = [
    { id: 'ti', source: internal.states[0]!.uid, target: null, transitionType: 'internal', event: 'ping', cond: '', actions: [] },
  ]
  assert(validateStructure(internal).ok, '无 target 的内部转移结构合法')

  const historyTargetless = twoStateDoc()
  historyTargetless.states.push(st(newUid(), 'h', 'history', historyTargetless.states[0]!.uid))
  historyTargetless.transitions = [
    { id: 'th', source: historyTargetless.states[2]!.uid, target: null, event: '', cond: '', actions: [] },
  ]
  assert(codes(historyTargetless).includes('structure.transition.history-targetless'), '历史默认转移无 target 报错')

  const eventlessInternal = twoStateDoc()
  eventlessInternal.transitions = [
    { id: 'te', source: eventlessInternal.states[0]!.uid, target: null, event: '', cond: '', actions: [] },
  ]
  assert(
    validateStructure(eventlessInternal).issues.some(
      (i) => i.code === 'structure.transition.internal-eventless' && i.severity === 'warning',
    ),
    '无事件内部转移给 warning',
  )

  const done = twoStateDoc()
  done.states[1]!.kind = 'final'
  done.states[1]!.doneData = { expr: "'ok'" }
  assert(validateStructure(done).ok, 'final 的 donedata expr 合法')

  const doneContent = twoStateDoc()
  doneContent.states[1]!.kind = 'final'
  doneContent.states[1]!.doneData = { content: '{"a":1}' }
  assert(validateStructure(doneContent).ok, 'final 的 donedata content 合法')

  const doneParams = twoStateDoc()
  doneParams.states[1]!.kind = 'final'
  doneParams.states[1]!.doneData = { params: [{ name: 'x', expr: '42' }] }
  assert(validateStructure(doneParams).ok, 'final 的 donedata param 合法')

  const doneNonFinal = twoStateDoc()
  doneNonFinal.states[0]!.doneData = { expr: '1' }
  assert(codes(doneNonFinal).includes('structure.state.donedata-not-final'), '非 final 的 donedata 报错')

  const finalOut = twoStateDoc()
  finalOut.states[1]!.kind = 'final'
  finalOut.transitions.push({
    id: 't-final-out',
    source: finalOut.states[1]!.uid,
    target: finalOut.states[0]!.uid,
    event: 'back',
    cond: '',
    actions: [],
  })
  assert(codes(finalOut).includes('structure.state.final-transition'), 'final 的出边报错')

  const doneAmbiguous = twoStateDoc()
  doneAmbiguous.states[1]!.kind = 'final'
  doneAmbiguous.states[1]!.doneData = { expr: "'x'", params: [{ name: 'x', expr: '1' }] }
  assert(codes(doneAmbiguous).includes('structure.state.donedata-ambiguous'), 'donedata 多形态并存报错')

  const doneBadParam = twoStateDoc()
  doneBadParam.states[1]!.kind = 'final'
  doneBadParam.states[1]!.doneData = { params: [{ name: '', expr: '' }] }
  assert(codes(doneBadParam).includes('structure.state.donedata-param-invalid'), 'donedata param 缺 name/expr 报错')
}

console.log('── B) engine 校验 ──')
{
  const ok = await validateAgainstEngine(trafficLightDoc(), { domParser })
  assert(ok.ok && ok.issues.length === 0, '合法文档通过引擎 parse+compile')

  const internalEngine = twoStateDoc()
  internalEngine.transitions = [
    { id: 'ti', source: internalEngine.states[0]!.uid, target: null, transitionType: 'internal', event: 'ping', cond: '', actions: [] },
  ]
  const internalOk = await validateAgainstEngine(internalEngine, { domParser })
  assert(internalOk.ok, '引擎接受无 target 的内部转移')

  const doneEngine = twoStateDoc()
  doneEngine.states[1]!.kind = 'final'
  doneEngine.states[1]!.doneData = { params: [{ name: 'x', expr: '42' }] }
  const doneOk = await validateAgainstEngine(doneEngine, { domParser })
  assert(doneOk.ok, '引擎接受 final 的 donedata param')

  const broken = await validateScxml('<scxml><state></scxml>', domParser)
  assert(!broken.ok && broken.issues.length > 0, '非法 XML 返回 issues')
  assert(broken.issues[0]!.code.startsWith('validation.engine.'), `错误 code 前缀（${broken.issues[0]!.code}）`)
  assert(typeof broken.issues[0]!.params.detail === 'string', '引擎原始错误文本放 params.detail')

  const full = await validateDocument(trafficLightDoc(), { domParser, policy: SERVER_POLICY })
  assert(full.ok && full.issues.length === 0, 'validateDocument：结构 + 命名 + 引擎全通过')

  // happy-dom 对 script CDATA 兼容性差：校验前中和 CDATA，Node 下同样能通过 compile
  const scripts = await validateDocument(extremeDemoDoc(), { domParser, policy: SERVER_POLICY })
  assert(scripts.ok, `含自定义 JS 的文档在 Node 下也能通过引擎校验（${scripts.issues[0]?.code ?? 'ok'}）`)
}

console.log('── C) 分层与拦截 ──')
{
  const broken = twoStateDoc()
  broken.transitions[0]!.target = 'nope'
  const result = await validateDocument(broken, { domParser, policy: SERVER_POLICY })
  assert(!result.ok && result.issues.some((i) => i.code === 'structure.transition.missing-target'), '结构错误进入 validateDocument')
  assert(result.source?.includes('<scxml'), '失败时保留序列化产物供 XML 片段展示')

  const naming = twoStateDoc()
  naming.datamodel = [{ id: 'g_old', expr: '0' }]
  const named = await validateDocument(naming, { domParser, policy: SERVER_POLICY })
  assert(!named.ok && named.issues.some((i) => i.code === 'naming.legacy-prefix' && i.kind === 'naming'), '命名错误在引擎前拦截并带 kind=naming')

  const scriptDoc = twoStateDoc()
  scriptDoc.states[0]!.entryActions = ['counter++']
  const hits = scanScriptActions(scriptDoc)
  const scriptIssues = scriptHitsToIssues(hits)
  assert(
    scriptIssues.length === 1 &&
      scriptIssues[0]!.code === 'validation.script-action' &&
      scriptIssues[0]!.params.line === 'counter++' &&
      scriptIssues[0]!.slot === 'entry',
    'script 命中转为结构化 issue（code/params/定位）',
  )
}

console.log('── D) 严格序列化与解析器前置条件 ──')
{
  const okDoc = trafficLightDoc()
  assert(serializeChecked(okDoc) === serializeToScxml(okDoc), 'serializeChecked 对合法文档与 serializeToScxml 一致')
  const bad = twoStateDoc()
  bad.transitions[0]!.target = 'nope'
  let thrown: unknown = null
  try {
    serializeChecked(bad)
  } catch (e) {
    thrown = e
  }
  assert(
    thrown instanceof DocumentStructureError &&
      thrown.code === 'document.invalid-structure' &&
      thrown.issues.some((i) => i.code === 'structure.transition.missing-target'),
    'serializeChecked 对非法结构抛 DocumentStructureError（含 issues）',
  )
  if (typeof DOMParser === 'undefined') {
    let parseErr: unknown = null
    try {
      scxmlToDoc('<scxml/>')
    } catch (e) {
      parseErr = e
    }
    assert(
      parseErr instanceof ScxmlImportError && parseErr.code === 'import.no-dom-parser',
      '缺少 DOMParser 时抛 ScxmlImportError（不是 ReferenceError）',
    )
  } else {
    console.log('  SKIP 当前环境有全局 DOMParser，跳过无解析器用例')
  }
}

console.log('── E) 静态守卫：core 不依赖引擎 ──')
{
  const here = dirname(fileURLToPath(import.meta.url))
  const coreDir = resolve(here, '../src/core')
  const offenders: string[] = []
  for (const f of readdirSync(coreDir).filter((x) => x.endsWith('.ts'))) {
    const src = readFileSync(join(coreDir, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    if (/@tinyactors\/scxmljs/.test(src) || /from '\.\.\/engine|from "\.\.\/engine/.test(src)) offenders.push(f)
  }
  assert(offenders.length === 0, `core 零引擎依赖（违规：${offenders.join(', ') || '无'}）`)
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
