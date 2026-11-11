/**
 * 引擎集成冒烟测试（Node，无需浏览器）：
 *   文档模型 → serializeToScxml → createSession(沙箱) → VirtualClock 快进 →
 *   校验激活态 / 事件注入 / 变量快照 / donedata。
 *
 * 运行：npm run test:smoke
 */
import { Window } from 'happy-dom'
import { createSession } from '@tinyactors/scxmljs'
import { VirtualClock } from '@tinyactors/scxmljs/trusted'
import {
  actionDemoDoc,
  entryExitDoc,
  faultCondDoc,
  parallelHistoryDoc,
  sendCancelDoc,
  trafficLightDoc,
} from '../src/core/examples'
import { serializeToScxml } from '../src/core/serializer'
import { actionToLine, parseActionLine } from '../src/core/action-parse'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('✗ FAIL:', msg)
    process.exit(1)
  }
  console.log('✓', msg)
}

const { window } = new Window()
const domParser = new window.DOMParser() as unknown as Parameters<
  typeof import('@tinyactors/scxmljs').createSession
>[1] extends infer O
  ? O extends { domParser?: infer D }
    ? D
    : never
  : never

const xml = serializeToScxml(trafficLightDoc())
console.log('── 生成的 SCXML ──')
console.log(xml)

const clock = new VirtualClock()
const session = await createSession(xml, { domParser, clock })

session.start()
assert(session.isActive('red') && session.isActive('on'), '初始进入 on/red')
assert(!session.isActive('green'), '初始未进入 green')

// 虚拟时钟快进到绝对时刻 16.5s（run 的参数是"绝对虚拟时间"）：
// 时间线 red(0-3)→green(3-6)→yellow(6-7,cycles+1)→red(7-10)→green(10-13)→
// yellow(13-14,cycles+1)→red(14-17)→…，16.5s 应处于 red，cycles=2
clock.run(16_500)
await session.settled()
assert(session.isActive('red'), '快进到 16.5s 后处于 red（完成两轮循环）')

const snap = session.snapshot()
assert(snap['cycles'] === 2, `变量 cycles 经 assign 累加 = 2（实际 ${JSON.stringify(snap['cycles'])}）`)

// 注入外部事件 power.off：on → off(final)
// 该示例的终态没有 <donedata>，done 应为 undefined（引擎行为正确）
session.send('power.off')
clock.run(16_500)
await session.settled()
const done = await session.done
assert(session.status === 'done', '会话到达终态结束')
assert(done === undefined, '无 donedata 时 done=undefined')

session.dispose()
console.log('\n── 场景二：并行状态 + 深历史 ──')

// 序列化并行/历史演示工程：<parallel> 两个 region + <history type="deep"> 默认转移
const xml2 = serializeToScxml(parallelHistoryDoc())
assert(
  xml2.includes('<parallel') && /<history\b[^>]*type="deep"/.test(xml2) && /<history\b[^>]*>\s*<transition target="work"/.test(xml2),
  '序列化产出 <parallel>、<history type="deep"> 及其默认转移',
)

const clock2 = new VirtualClock()
const s2 = await createSession(xml2, { domParser, clock: clock2 })
s2.start()
assert(
  s2.isActive('main') && s2.isActive('work') && s2.isActive('heat') && s2.isActive('stir') && s2.isActive('off') && s2.isActive('stopped'),
  '初始：两个并行 region 同时激活（heat/stir 各自 initial）',
)

// 驱动两个 region 各自切换（VirtualClock：send 后需 run 处理 deferred 外部事件）
s2.send('turnOn')
s2.send('start')
clock2.run(1000)
await s2.settled()
assert(s2.isActive('on') && s2.isActive('running') && !s2.isActive('off') && !s2.isActive('stopped'), 'turnOn+start：两 region 内部状态切换')

// abort：main 整体退出（此刻深历史记录全部后代配置）
s2.send('abort')
clock2.run(1000)
await s2.settled()
assert(s2.isActive('crashed') && !s2.isActive('main') && !s2.isActive('work'), 'abort：main 退出（深历史此刻记录），进入故障停机')

// restart → 深历史恢复：main 重进，两 region 回到退出前的 on + running
s2.send('restart')
clock2.run(1000)
await s2.settled()
assert(
  s2.isActive('main') && s2.isActive('work') && s2.isActive('on') && s2.isActive('running') && !s2.isActive('crashed'),
  'restart：深历史恢复退出前的 region 内部状态（on+running）',
)
s2.dispose()

console.log('\n── 场景三：进入/退出动作（onentry/onexit）──')
const xml3 = serializeToScxml(entryExitDoc())
assert(xml3.includes('<onentry>') && xml3.includes('<onexit>') && xml3.includes('<assign'), '序列化包含 onentry/onexit/assign')
const clock3 = new VirtualClock()
const s3 = await createSession(xml3, { domParser, clock: clock3 })
s3.start()
assert(s3.isActive('dark') && s3.snapshot()['visits'] === 0, '初始：暗，visits=0')
s3.send('switch')
clock3.run(1000)
await s3.settled()
assert(s3.isActive('lit') && s3.snapshot()['visits'] === 1, 'switch → 亮（entry: visits+1 = 1）')
s3.send('switch')
clock3.run(1000)
await s3.settled()
s3.send('switch')
clock3.run(1000)
await s3.settled()
assert(s3.isActive('lit') && s3.snapshot()['visits'] === 2, '再切两轮 → 亮，visits=2（exit/entry 往复执行）')
s3.dispose()

console.log('\n── 场景四：延时发送与取消（send delay / cancel）──')
const xml4 = serializeToScxml(sendCancelDoc())
assert(xml4.includes('delay="3s"') && xml4.includes('<cancel sendid="alarm"/>'), '序列化包含 send delay 与 cancel')
const clock4 = new VirtualClock()
const s4 = await createSession(xml4, { domParser, clock: clock4 })
s4.start()
assert(s4.isActive('running'), '初始：运行（entry 布防 3s 闹钟）')
// 在闹钟触发前 pause：exit 撤防，之后即使虚拟时间大幅推进也不应超时
s4.send('pause')
clock4.run(1000)
await s4.settled()
assert(s4.isActive('paused'), 'pause → 已暂停')
clock4.run(6000)
await s4.settled()
assert(!s4.isActive('timedout') && s4.isActive('paused'), 'alarm 已被 cancel：虚拟时间推进 6s 仍不超时')
// resume 重新布防；这次不 pause，3 秒后 alarm 触发（run 是绝对时刻，须基于 now() 前推）
s4.send('resume')
clock4.run(clock4.now() + 1000)
await s4.settled()
clock4.run(clock4.now() + 4000)
await s4.settled()
assert(s4.isActive('timedout'), 'resume 后未 pause：3 秒后 alarm 触发进入超时')
s4.dispose()

console.log('\n── 场景五：故障全局转移 + 同名事件 + 条件与或非 ──')
const xml5 = serializeToScxml(faultCondDoc())
assert(
  xml5.includes('cond="temp &gt; 80 &amp;&amp; door"') && xml5.includes('cond="!door"'),
  '序列化：cond 属性正确转义（&&→&amp;&amp;）并包含非运算',
)
const clock5 = new VirtualClock()
const s5 = await createSession(xml5, { domParser, clock: clock5 })
s5.start()
async function fire5(event: string): Promise<void> {
  s5.send(event)
  clock5.run(clock5.now() + 1000)
  await s5.settled()
}
assert(
  s5.isActive('system') && s5.isActive('run') && s5.isActive('cool') && s5.isActive('stopped'),
  '初始：并行双区域就位',
)
await fire5('toggle')
assert(s5.isActive('hot') && s5.isActive('running'), '同名事件 toggle：两个区域同时切换（4 个不同源/目标）')
await fire5('fault')
assert(s5.isActive('faulted'), 'fault：从并行区域内部经祖先转移全局进入故障态')
await fire5('reset')
assert(s5.isActive('run') && s5.isActive('cool') && s5.isActive('stopped'), 'reset：重新进入 run（区域回初始）')
await fire5('inspect')
assert(s5.isActive('guard1'), 'inspect → 条件路由起点（temp=0, door=false）')
await fire5('check')
assert(s5.isActive('guard1'), 'AND 假：事件到达但 temp>80&&door 不成立 → 原地')
await fire5('heatup')
await fire5('heatup')
assert(s5.snapshot()['temp'] === 100, 'heatup×2：temp=100（assign 自环）')
await fire5('check')
assert(s5.isActive('guard1'), 'AND 假：temp>80 满足但 door=false → 仍不跳转（缺一不可）')
await fire5('opendoor')
assert(s5.snapshot()['door'] === true, 'opendoor：door=true')
await fire5('check')
assert(s5.isActive('guard2'), 'AND 真：temp>80 && door 都满足 → guard2')
await fire5('check')
assert(s5.isActive('guard3'), 'OR 真：temp>80 || door → guard3')
await fire5('check')
assert(s5.isActive('guard3'), 'NOT 假：door=true 时 !door 不成立 → 原地')
await fire5('closedoor')
await fire5('check')
assert(s5.isActive('guard1'), 'NOT 真：!door → 回 guard1')
await fire5('fault')
assert(s5.isActive('faulted'), '再次验证全局故障（从 guard1）')
s5.dispose()

console.log('\n── 场景六：结构化动作（解析往返 + 采样升温案例） ──')
// 动作行 ↔ 结构 往返一致（结构化编辑器的数据完整性基础）
const samples = [
  'send 采样 delay 1s id 采样',
  'send 故障广播',
  'cancel 采样',
  'assign 温度 = 温度 + 20',
  "log '第 ' + 次数 + ' 轮'",
  'counter++',
]
for (const line of samples) {
  const st6 = parseActionLine(line)
  assert(actionToLine(st6) === line, `动作往返一致：${line}`)
}
// 引擎运行采样升温案例：entry 延时采样 → 自环升温 ×3 → 条件跳转达标
const xml6 = serializeToScxml(actionDemoDoc())
const clock6 = new VirtualClock()
const s6 = await createSession(xml6, { domParser, clock: clock6 })
s6.start()
async function fire6(event: string): Promise<void> {
  s6.send(event)
  clock6.run(clock6.now() + 1500)
  await s6.settled()
}
assert(s6.isActive('停机'), '初始 停机')
await fire6('开机')
assert(s6.isActive('运行') && s6.snapshot()['温度'] === 20 && s6.snapshot()['次数'] === 1, '开机 + 第 1 次延时采样：温度=20')
clock6.run(clock6.now() + 2000)
await s6.settled()
assert(s6.snapshot()['温度'] === 60 && s6.snapshot()['次数'] === 3, '两次采样后：温度=60, 次数=3（1s 处的自环也已执行）')
clock6.run(clock6.now() + 2000)
await s6.settled()
assert(s6.isActive('达标') && s6.snapshot()['温度'] === 60 && s6.snapshot()['次数'] === 3, '温度 >= 60 → 条件跳转「达标」（entry cancel 采样）')
await fire6('关机')
assert(s6.isActive('停机'), '关机 → 停机')
await fire6('开机')
assert(
  s6.isActive('运行') && s6.snapshot()['温度'] === 20 && s6.snapshot()['次数'] === 1,
  '再次开机：转移动作清零后第一轮采样（温度=20, 次数=1）——重开即重新起量',
)
s6.dispose()

console.log('\n全部通过 ✅')
