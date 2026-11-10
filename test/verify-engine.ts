/**
 * P2 引擎层验证：
 *   A. 懒加载器：mode 选择、并发共享、预热、无效模式/选项
 *   B. data 预置：sandboxed / trusted 两种数据模型
 *   C. 生命周期：start/stop 竞态、重复启动、idle 控制、监听器隔离
 *   D. scriptTimeoutMs / maxMicrosteps 真正透传到引擎
 *   E. 变量写入返回结构化 code/params；snapshot/settled/status
 *   F. engine 入口不静态 import 任一引擎实现
 *
 * 运行：npm run test:engine
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'
import type { DOMParserLike } from '@tinyactors/scxmljs/trusted'
import { emptyDoc, newUid, type ProjectDoc, type StateNode } from '../src/core/model'
import { serializeToScxml } from '../src/core/serializer'
import { SessionRunner } from '../src/engine/session-runner'
import {
  createEngineSession,
  loadEngine,
  normalizeEngineOptions,
  preloadEngine,
} from '../src/engine/engine-loader'

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

const st = (uid: string, id: string, kind: StateNode['kind'] = 'atomic', entry: string[] = []): StateNode => ({
  uid,
  id,
  label: id,
  kind,
  parent: null,
  initial: null,
  entryActions: entry,
  exitActions: [],
})

function dataDoc(): { doc: ProjectDoc; xml: string } {
  const doc = emptyDoc('engine')
  doc.datamodel = [{ id: 'count', expr: '0' }]
  const idle = newUid()
  const done = newUid()
  doc.states = [st(idle, 'idle'), st(done, 'done', 'final')]
  doc.initial = idle
  doc.transitions = [{ id: 't-go', source: idle, target: done, event: 'go', cond: '', actions: [] }]
  return { doc, xml: serializeToScxml(doc) }
}

function scriptTimeoutXml(): string {
  // 走序列化器（会产出 script CDATA）：验证 createEngineSession 的 CDATA 中和，
  // 否则 happy-dom 下的 Node 会话会因 CDATA 解析失败而根本跑不到 timeout。
  const doc = emptyDoc('timeout')
  const a = newUid()
  doc.states = [st(a, 'a', 'atomic', ['while (true) {}'])]
  doc.initial = a
  return serializeToScxml(doc)
}

function microstepLoopXml(): string {
  const doc = emptyDoc('loop')
  const a = newUid()
  doc.states = [st(a, 'a')]
  doc.initial = a
  doc.transitions = [{ id: 't-loop', source: a, target: a, event: '', cond: '', actions: [] }]
  return serializeToScxml(doc)
}

async function waitFor(pred: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now()
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error('waitFor timeout')
    await new Promise((r) => setTimeout(r, 10))
  }
}

console.log('── A) 懒加载器 ──')
{
  const p1 = loadEngine('trusted')
  const p2 = loadEngine('trusted')
  assert(p1 === p2, '同一 mode 的并发调用共享同一个 Promise')
  const trusted = await p1
  assert(typeof trusted.createSession === 'function' && typeof trusted.PlaybackClock === 'function', 'trusted 模块含 createSession/PlaybackClock')

  const sandboxed = await preloadEngine('sandboxed')
  assert(typeof sandboxed.loadQuickJS === 'function', 'sandboxed 模块含 loadQuickJS')
  assert(sandboxed === (await loadEngine('sandboxed')), '预热后 loadEngine 命中同一模块')

  let badMode = false
  try {
    loadEngine('bogus' as never)
  } catch (e) {
    badMode = e instanceof TypeError
  }
  assert(badMode, '未知 engine mode 抛 TypeError')

  const bad: boolean[] = []
  for (const opts of [
    { scriptTimeoutMs: 0 },
    { scriptTimeoutMs: Number.NaN },
    { maxMicrosteps: 1.5 },
    { maxMicrosteps: -1 },
    { memoryLimitBytes: 0 },
  ]) {
    try {
      normalizeEngineOptions(opts)
      bad.push(false)
    } catch (e) {
      bad.push(e instanceof RangeError)
    }
  }
  assert(bad.every(Boolean), '非法 timeout/microsteps/memory 抛 RangeError')
  let badData = false
  try {
    normalizeEngineOptions({ data: null as never })
  } catch (e) {
    badData = e instanceof TypeError
  }
  assert(badData, 'data 非对象抛 TypeError')
}

console.log('── B) data 预置（两种数据模型）──')
{
  const { xml } = dataDoc()
  for (const engine of ['sandboxed', 'trusted'] as const) {
    const s = await createEngineSession(xml, { engine, domParser, data: { count: 41 } })
    s.start()
    assert(s.snapshot()['count'] === 41, `${engine}：createEngineSession 的 data 在 start 前生效`)
    s.dispose()

    const runner = new SessionRunner({ engine, domParser, data: { count: 5 } })
    await runner.start(xml)
    assert(runner.snapshot()['count'] === 5, `${engine}：SessionRunner 构造器 data 生效`)
    await runner.start(xml, { data: { count: 9 } })
    assert(runner.snapshot()['count'] === 9, `${engine}：StartOptions.data 浅合并覆盖构造器 data`)
    await runner.stop()
  }
}

console.log('── C) 生命周期与控制 ──')
{
  const { xml } = dataDoc()
  const runner = new SessionRunner({ domParser })
  assert(runner.status === 'idle' && !runner.running, '初始 idle')
  assert(runner.pause() === false && runner.play() === false && runner.step() === 0, '未运行时 pause/play/step 是 no-op')
  assert(runner.setSpeed(Number.NaN) === 0 && runner.setSpeed(-3) === 0, 'NaN/负数速度归零')
  let logs = 0
  runner.on((e) => {
    if (e.type === 'log') logs++
  })
  runner.pause()
  runner.play()
  runner.step()
  assert(logs === 0, 'idle 控制不写误导性日志')

  // stop 发生在 start 创建会话之前：陈旧 start 必须销毁刚创建的会话而不安装
  const pending = runner.start(xml)
  await runner.stop()
  await pending
  assert(!runner.running && runner.status === 'idle', 'start 进行中 stop：迟到的会话被丢弃')

  // 正常启动 + 监听器隔离
  const seen: string[] = []
  let activeCount = 0
  let hookCalls = 0
  const runner2 = new SessionRunner({
    domParser,
    onListenerError: () => {
      hookCalls++
    },
  })
  runner2.on(() => {
    throw new Error('bad listener')
  })
  runner2.on((e) => {
    if (e.type === 'active') {
      seen.push('active')
      activeCount++
    }
  })
  await runner2.start(xml)
  assert(seen.includes('active') && hookCalls > 0, '抛错监听器不阻断后续监听器，并触发 onListenerError')
  assert(activeCount === 1, '启动只派发一次 active（不重复初始宏步）')
  assert(runner2.engineMode === 'sandboxed' && runner2.status === 'running', '启动后 running，engineMode 可读')
  assert(runner2.send('go') === true, 'send 返回 true')
  await runner2.settled()
  assert(runner2.status === 'done', '事件后到达终态，status=done')
  await runner2.stop()
  assert(runner2.status === 'idle' && runner2.snapshot()['count'] === undefined, 'stop 后 session 清空')
  assert(runner2.send('go') === false, '未运行时 send 返回 false')

  // 启动失败：不能留下半初始化状态或时钟
  const badRunner = new SessionRunner({ domParser })
  let startFailed = false
  try {
    await badRunner.start('<scxml><state></scxml>')
  } catch {
    startFailed = true
  }
  assert(startFailed && !badRunner.running && badRunner.status === 'idle', '非法 SCXML 启动失败后回到 idle')

  // 监听器在初始 macrostep 里同步 stop：start 不能继续写“已启动”或安装会话
  const reentrant = new SessionRunner({ domParser })
  let startedLog = false
  reentrant.on((e) => {
    if (e.type === 'active') void reentrant.stop()
    if (e.type === 'log' && e.entry.text.includes('会话已启动')) startedLog = true
  })
  await reentrant.start(xml)
  assert(!reentrant.running && !startedLog, '初始 macrostep 内 stop：不再写已启动、会话已释放')
}

console.log('── D) scriptTimeoutMs / maxMicrosteps ──')
{
  const timeoutRunner = new SessionRunner({ domParser, scriptTimeoutMs: 30 })
  const errors: string[] = []
  timeoutRunner.on((e) => {
    if (e.type === 'log' && e.entry.kind === 'error') errors.push(e.entry.text)
  })
  await timeoutRunner.start(scriptTimeoutXml())
  await waitFor(() => errors.length > 0)
  assert(errors.some((t) => t.includes('error.execution')), `scriptTimeoutMs 中断死循环（${errors[0]}）`)
  await timeoutRunner.stop()

  const loopRunner = new SessionRunner({ domParser, engine: 'trusted', maxMicrosteps: 10 })
  const loopErrors: string[] = []
  loopRunner.on((e) => {
    if (e.type === 'log' && e.entry.kind === 'error') loopErrors.push(e.entry.text)
  })
  await loopRunner.start(microstepLoopXml())
  await waitFor(() => loopErrors.length > 0)
  assert(
    loopErrors.some((t) => t.includes('more than 10 microsteps')),
    `maxMicrosteps 限制无事件自环（${loopErrors[0]}）`,
  )
  await loopRunner.stop()
}

console.log('── E) 变量写入 / snapshot ──')
{
  const { xml } = dataDoc()
  const runner = new SessionRunner({ domParser, data: { count: 1 } })
  await runner.start(xml)
  const plus = runner.assignVariable('count', 'count + 41')
  assert(plus.ok && plus.code === 'variable.assign-expr', `assignVariable 成功（${plus.code}）`)
  assert(runner.snapshot()['count'] === 42, 'assignVariable 在引擎内求值（count=42）')
  const direct = runner.assignValue('count', 7)
  assert(direct.ok && direct.code === 'variable.assign-value', 'assignValue 成功')
  assert(runner.snapshot()['count'] === 7, 'assignValue 直接写入（count=7）')
  const unknown = runner.assignValue('nope', 1)
  assert(!unknown.ok && unknown.code === 'variable.unknown', '未知变量返回 variable.unknown')
  await runner.stop()
  const idle = runner.assignVariable('count', '1')
  assert(!idle.ok && idle.code === 'variable.session-not-running', '未运行返回 variable.session-not-running')
}

console.log('── F) 入口不静态 import 引擎 ──')
{
  const here = dirname(fileURLToPath(import.meta.url))
  const files = ['session-runner.ts', 'validator.ts', 'engine-loader.ts']
  const offenders: string[] = []
  for (const f of files) {
    const code = readFileSync(resolve(here, '../src/engine', f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    // 允许 `import type ... from '@tinyactors/scxmljs/...'`；不允许值 import
    const bad = /import\s+(?!type\b)[^;]*from\s+['"]@tinyactors\/scxmljs(?:\/trusted)?['"]/.test(code)
    if (bad) offenders.push(f)
  }
  assert(offenders.length === 0, `engine 仅动态 import 引擎实现（违规：${offenders.join(', ') || '无'}）`)
  const loader = readFileSync(resolve(here, '../src/engine/engine-loader.ts'), 'utf8')
  assert(/import\('@tinyactors\/scxmljs\/trusted'\)/.test(loader), 'loader 动态 import trusted')
  assert(/import\('@tinyactors\/scxmljs'\)/.test(loader), 'loader 动态 import sandboxed')
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
