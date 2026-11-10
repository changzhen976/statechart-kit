/**
 * P1 事件目录 / 激活树验证：
 *   A. docEventFacts：发出/监听集合、发出位置、监听边、自动延迟来源
 *   B. buildDirectionCatalog：三方向分组、外部来源透传、广播标记
 *   C. collectDocEvents
 *   D. activeTree / flattenActiveTree / activeSummary（结构化摘要）
 *
 * 运行：npm run test:events
 */
import { activeSummary, activeTree, flattenActiveTree } from '../src/core/active-tree'
import {
  buildDirectionCatalog,
  collectDocEvents,
  docEventFacts,
  type ExternalEventSource,
} from '../src/core/event-catalog'
import { emptyDoc, newUid, type ProjectDoc, type StateNode } from '../src/core/model'
import { SERVER_POLICY } from '../src/policies/server'

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

const st = (
  uid: string,
  id: string,
  kind: StateNode['kind'] = 'atomic',
  parent: string | null = null,
  entry: string[] = [],
  exit: string[] = [],
): StateNode => ({
  uid,
  id,
  label: id.toUpperCase(),
  kind,
  parent,
  initial: null,
  entryActions: entry,
  exitActions: exit,
})

function catalogDoc(): ProjectDoc {
  const doc = emptyDoc('catalog')
  const uA = newUid()
  const uB = newUid()
  const uC = newUid()
  doc.initial = uA
  doc.states = [
    st(uA, 'a', 'atomic', null, ['send evt.boot'], ['send evt.done']),
    st(uB, 'b', 'atomic', null),
    st(uC, 'c', 'atomic', null),
  ]
  doc.transitions = [
    { id: 't1', source: uA, target: uB, event: 'evt.go', cond: '', actions: ['send evt.mid', 'send evt.boot'] },
    {
      id: 't2',
      source: uB,
      target: uC,
      event: 'delay2s_b_to_c',
      cond: '',
      actions: [],
      delayMs: 2000,
      delayUnit: 's',
    },
  ]
  return doc
}

console.log('── A) docEventFacts ──')
{
  const doc = catalogDoc()
  const facts = docEventFacts(doc)
  assert([...facts.sends].sort().join(',') === 'delay2s_b_to_c,evt.boot,evt.done,evt.mid', `发出事件集合（${[...facts.sends].sort().join(',')}）`)
  assert([...facts.listens].sort().join(',') === 'delay2s_b_to_c,evt.go', '监听事件集合')
  const boot = facts.sendOrigins.get('evt.boot') ?? []
  assert(
    boot.some((o) => o.kind === 'state-action' && o.state.id === 'a' && o.slot === 'entry') &&
      boot.some((o) => o.kind === 'transition-action' && o.transitionId === 't1'),
    'evt.boot 有两个发出位置：状态 a entry + 转移 t1',
  )
  const done = facts.sendOrigins.get('evt.done') ?? []
  assert(done.length === 1 && done[0]!.kind === 'state-action' && done[0]!.slot === 'exit', 'evt.done 来自状态 a exit')
  const auto = facts.sendOrigins.get('delay2s_b_to_c') ?? []
  assert(
    auto.length === 1 && auto[0]!.kind === 'auto-delay' && auto[0]!.delayMs === 2000 && auto[0]!.source.id === 'b',
    '自动延迟事件来源标注（2s / b→c）',
  )
  const edge = facts.listenEdges.get('evt.go') ?? []
  assert(edge.length === 1 && edge[0]!.source.id === 'a' && edge[0]!.target.id === 'b', '监听边 a→b')
  // 同一转移内的重复 send 只记一个来源
  const mid = facts.sendOrigins.get('evt.mid') ?? []
  assert(mid.length === 1, '同一转移内重复 send 合并为一个来源')
}

console.log('── B) buildDirectionCatalog ──')
{
  const doc = catalogDoc()
  const facts = docEventFacts(doc)
  const ext: ExternalEventSource[] = [
    { value: 'clock.tick', tag: 'clock 1000ms' },
    { value: 'route.in', tag: 'route' },
  ]
  const cat = buildDirectionCatalog(SERVER_POLICY, facts.sends, facts.listens, ext, {
    includeUnlistenedExt: true,
  })
  assert(cat.in.map((r) => r.value).join(',') === 'clock.tick,route.in', 'includeUnlistenedExt=true：全部外部来源进 in')
  assert(cat.out.map((r) => r.value).join(',') === 'delay2s_b_to_c,evt.boot,evt.done,evt.mid', '本机发出按名称排序')
  assert(cat.lone.map((r) => r.value).join(',') === 'evt.go', '仅监听：evt.go（自动延迟名已在 sends 中）')
  assert(cat.out.some((r) => r.value === 'ge_alarm' && r.broadcast === true) === false, '未传入的 ge_ 事件不会凭空出现')

  const withBroadcast = buildDirectionCatalog(
    SERVER_POLICY,
    ['ge_alarm', 'mqe_topic'],
    [],
    [],
  )
  assert(withBroadcast.out[0]!.broadcast === true && withBroadcast.out[1]!.broadcast !== true, 'ge_ 行带 broadcast，mqe_ 不带')

  const observed = buildDirectionCatalog(SERVER_POLICY, [], ['clock.tick'], ext, {
    includeUnlistenedExt: false,
  })
  assert(observed.in.length === 1 && observed.in[0]!.value === 'clock.tick', '观察视角只列被监听的外部来源')
  assert(observed.in[0]!.tag === 'clock 1000ms' && observed.in[0]!.tip === undefined, '外部 tag/tip 原样透传')
}

console.log('── C) collectDocEvents ──')
{
  const names = collectDocEvents(catalogDoc())
  assert(names.join(',') === 'delay2s_b_to_c,evt.boot,evt.done,evt.go,evt.mid', `全部事件去重排序（${names.join(',')}）`)
}

console.log('── D) activeTree / activeSummary ──')
{
  const doc = emptyDoc('active')
  const main = newUid()
  const a = newUid()
  const b = newUid()
  const c = newUid()
  const on = newUid()
  doc.states = [
    st(main, 'main', 'compound', null),
    st(a, 'a', 'atomic', main),
    st(b, 'b', 'compound', main),
    st(c, 'c', 'atomic', b),
    st(on, 'on', 'atomic', null),
  ]
  doc.states[0]!.initial = b
  doc.states[2]!.initial = c
  const tree = activeTree(doc, ['a', 'b', 'c'])
  assert(tree.length === 1 && tree[0]!.id === 'main', '根仅保留激活分支 main')
  assert(tree[0]!.children.map((n) => n.id).join(',') === 'a,c', '单链 b→c 合并为 c（父名进入 label）')
  assert(tree[0]!.children[1]!.label === 'B ▸ C', '合并链 label 为「父 ▸ 子」')
  const rows = flattenActiveTree(tree)
  assert(rows.map((r) => `${r.depth}:${r.label}:${r.leaf}`).join('|') === '0:MAIN:false|1:A:true|1:B ▸ C:true', `展平行（${rows.map((r) => r.path).join(',')}）`)
  const summary = activeSummary(doc, ['a', 'b', 'c'], 1)
  assert(summary.count === 2 && summary.truncated && summary.labels.join(',') === 'A,B ▸ C', '结构化摘要：labels/count/truncated')
  assert(activeTree(doc, ['on']).map((n) => n.id).join(',') === 'on', '陈旧/未激活分支被剪掉')
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
