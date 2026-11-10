/**
 * scxmljs 会话封装：创建/运行/回放控制/事件注入/销毁。
 *
 * - 引擎用 sandboxed 入口（`@tinyactors/scxmljs`）：GUI 用户编写的 cond/expr 属于
 *   "用户写的图表"，必须跑在 QuickJS 沙箱里（防死循环、限内存、页面隔离）。
 *   首次运行会按需加载 QuickJS WASM（约 290KB），第一次"运行"略有延迟是正常的。
 * - PlaybackClock：play/pause/step/speed 驱动整个会话时间（延时 send 也跟着暂停）。
 * - 会话是标准 EventTarget，事件名：microstep / macrostep / log / error / send /
 *   invoke / child / done（见 dist/session-events.d.ts）。
 * - snapshot() 是官方的变量读取 API（把 <data> 变量按 id 拷出）。
 */
import { createSession } from '@tinyactors/scxmljs'
import { PlaybackClock } from '@tinyactors/scxmljs/trusted'
import type { DOMParserLike, SCXMLSession } from '@tinyactors/scxmljs/trusted'
import {
  fitData,
  levelOf,
  truncateText,
  type LogLevel,
  type LogSource,
  type SimLogEntry,
} from '../core/log'

/** 运行日志条目（仿真面板展示用；类型定义在 core/log，见 P19） */
export type { SimLogEntry }

/** 一次微步实际发生的转移（引擎侧状态 id），供画布闪烁连线 */
export interface FiredPair {
  sourceId: string
  targetId: string
}

/** runner → store 的回调事件 */
export type RunnerEvent =
  | { type: 'active'; ids: string[] }
  | { type: 'fired'; pairs: FiredPair[] }
  | { type: 'send'; name: string; data?: unknown }
  | { type: 'log'; entry: SimLogEntry }
  | { type: 'stopped' }

type Listener = (ev: RunnerEvent) => void

export interface SessionRunnerOptions {
  /**
   * Node 环境解析 SCXML 文本所需（happy-dom / linkedom 的 DOMParser 实例）；
   * 浏览器可省略（使用全局 DOMParser）。服务端（MachineManager）必须注入。
   */
  domParser?: DOMParserLike
}

export class SessionRunner {
  private session: SCXMLSession | null = null
  private clock: PlaybackClock | null = null
  private off: (() => void)[] = []
  private listeners = new Set<Listener>()
  private _speed = 1

  constructor(private opts: SessionRunnerOptions = {}) {}

  get running(): boolean {
    return !!this.session
  }
  get sessionOrNull(): SCXMLSession | null {
    return this.session
  }
  get speed(): number {
    return this._speed
  }
  get domParser(): DOMParserLike | undefined {
    return this.opts.domParser
  }

  /** 当前激活状态 id（文档顺序）；未运行返回空数组 */
  activeStateIds(): string[] {
    return this.session?.activeStateIds() ?? []
  }

  on(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  private emit(ev: RunnerEvent): void {
    for (const l of [...this.listeners]) l(ev)
  }
  private log(
    kind: SimLogEntry['kind'],
    text: string,
    extra?: { level?: LogLevel; source?: LogSource; data?: unknown },
  ): void {
    this.emit({
      type: 'log',
      entry: {
        time: Date.now(),
        kind,
        text: truncateText(text),
        level: levelOf(kind, extra?.level),
        source: extra?.source ?? 'run',
        ...(extra?.data !== undefined ? { data: fitData(extra.data) } : {}),
      },
    })
  }

  /** 启动会话：旧会话先销毁；source 为 SCXML 文本 */
  async start(source: string): Promise<void> {
    await this.stop()
    const clock = new PlaybackClock({ speed: this._speed })
    const session = await createSession(source, { clock, domParser: this.opts.domParser })

    const onMacro = () => {
      this.emit({ type: 'active', ids: session.activeStateIds() })
    }
    const onMicro = (e: any) => {
      const pairs: FiredPair[] = []
      for (const t of e.transitions ?? []) {
        for (const target of t.targets ?? []) {
          pairs.push({ sourceId: t.source?.id ?? '?', targetId: target.id })
        }
      }
      if (pairs.length) this.emit({ type: 'fired', pairs })
    }
    const onLog = (e: any) => {
      // text 只放正文；kind 由展示层统一显示，避免出现 [log] [log]
      const label = e.label && e.label !== 'log' ? `[${e.label}] ` : ''
      this.log('log', `${label}${String(e.value ?? '')}`)
    }
    const onError = (e: any) => {
      this.log('error', `${e.kind}: ${e.message}`)
    }
    const onDone = () => {
      this.log('lifecycle', '会话已到达终态结束')
    }

    const onSendEv = (e: any) => {
      // 图内 <send> 是真正的“发送事件”（MQTT 出向桥也会拦截同一事件）
      const name = e.message?.event ?? ''
      const data = e.message?.data
      this.log('send', `发送事件 ${name}${data !== undefined ? ` ${JSON.stringify(data)}` : ''}`, { data })
      this.emit({ type: 'send', name, data })
    }
    session.addEventListener('send', onSendEv)
    session.addEventListener('macrostep', onMacro)
    session.addEventListener('microstep', onMicro)
    session.addEventListener('log', onLog)
    session.addEventListener('error', onError)
    session.addEventListener('done', onDone)
    this.off = [
      () => session.removeEventListener('send', onSendEv),
      () => session.removeEventListener('macrostep', onMacro),
      () => session.removeEventListener('microstep', onMicro),
      () => session.removeEventListener('log', onLog),
      () => session.removeEventListener('error', onError),
      () => session.removeEventListener('done', onDone),
    ]

    this.clock = clock
    this.session = session
    session.start()
    this.log('lifecycle', '会话已启动（沙箱数据模型）')
    onMacro()
  }

  pause(): void {
    this.clock?.pause()
    this.log('lifecycle', '已暂停')
  }

  play(): void {
    this.clock?.play()
    this.log('lifecycle', '继续运行')
  }

  /** 是否处于暂停（未在播放） */
  get paused(): boolean {
    return this.clock ? !this.clock.playing : false
  }

  step(): void {
    const n = this.clock?.step()
    this.log('lifecycle', `单步（执行 ${n ?? 0} 个任务）`)
  }

  setSpeed(n: number): void {
    this._speed = n
    if (this.clock) this.clock.speed = n
    this.log('lifecycle', `速度 = ${n}x`)
  }

  /**
   * 注入外部事件（进入会话的外部队列）。
   * logText：自定义日志文案；传 **null** 则完全不写日志——广播/时钟注入使用，
   * 避免不消费该事件的机器日志被刷屏（消费与否看机器自身反应：画布翻转/图内 log）。
   * logKind 默认 `inject`（外部事件注入）；source 会附在日志尾部，如 mqtt:home/temp。
   */
  send(
    name: string,
    data?: unknown,
    logText?: string | null,
    logKind: SimLogEntry['kind'] = 'inject',
    source?: string,
  ): void {
    if (!this.session) return
    try {
      this.session.send(name, data)
      if (logText !== null) {
        const action = logKind === 'send' ? '发送' : '接收'
        let text = logText ?? `${action}事件 ${name}${data !== undefined ? ` ${JSON.stringify(data)}` : ''}`
        if (source) text += `（${source}）`
        this.log(logKind, text, { data })
      }
    } catch (e) {
      this.log('error', `发送 ${name} 失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 读取数据模型变量（官方 snapshot API；未运行时返回 null） */
  readVariables(): Record<string, unknown> | null {
    if (!this.session) return null
    try {
      return this.session.snapshot()
    } catch {
      return null
    }
  }

  /** 宿主侧修改变量（JS 表达式在引擎内求值赋值，走官方 DataModel.assignExpr） */
  assignVariable(id: string, expr: string): { ok: boolean; message: string } {
    const dm = (this.session as any)?.datamodel
    if (!dm) return { ok: false, message: '会话未运行' }
    try {
      if (typeof dm.isValidLocation === 'function' && !dm.isValidLocation(id)) {
        return { ok: false, message: `未知变量：${id}` }
      }
      dm.assignExpr(id, expr)
      return { ok: true, message: `${id} = ${expr}` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }

  /** 宿主侧直接写入值（不经表达式求值；keepVars 迁移用） */
  assignValue(id: string, value: unknown): { ok: boolean; message: string } {
    const dm = (this.session as any)?.datamodel
    if (!dm) return { ok: false, message: '会话未运行' }
    try {
      if (typeof dm.isValidLocation === 'function' && !dm.isValidLocation(id)) {
        return { ok: false, message: `未知变量：${id}` }
      }
      dm.assignValue(id, value)
      return { ok: true, message: `${id} = ${JSON.stringify(value)}` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }

  /** 读取数据模型变量（官方 snapshot API；未运行时返回空对象） */
  snapshot(): Record<string, unknown> {
    if (!this.session) return {}
    try {
      return this.session.snapshot()
    } catch {
      return {}
    }
  }

  /** 停止并销毁会话（引擎要求宿主负责 dispose） */
  async stop(): Promise<void> {
    const session = this.session
    if (!session) return
    this.session = null
    this.clock = null
    for (const fn of this.off) fn()
    this.off = []
    try {
      session.dispose()
    } catch {
      /* dispose 幂等 */
    }
    this.log('lifecycle', '会话已停止')
    this.emit({ type: 'stopped' })
  }
}
