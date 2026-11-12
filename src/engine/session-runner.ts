/**
 * scxmljs 会话封装：创建/运行/回放控制/事件注入/销毁。
 *
 * P2 起支持两种数据模型，默认 sandboxed：
 * - `sandboxed`（`@tinyactors/scxmljs`）：QuickJS/WASM，用户编写的 cond/expr/script
 *   跑在独立沙箱里；首次使用按需加载约 290KB WASM。
 * - `trusted`（`@tinyactors/scxmljs/trusted`）：宿主自己的 JS realm，无 WASM；
 *   只应用于完全可信的图表（脚本可触达宿主）。
 *
 * 生命周期：`start()` 用 generation 令牌防止并发启动泄漏旧会话；`stop()` 递增令牌，
 * 正在加载中的 start 会在创建完成后立即销毁会话。所有会话事件监听器先按当前会话
 * 过滤，再交给宿主监听器；宿主监听器抛错不会阻断其他监听器或引擎宏步。
 */
import type {
  DOMParserLike,
  DoneEvent,
  LogEvent,
  MacrostepEvent,
  MicrostepEvent,
  PlaybackClock,
  SCXMLErrorEvent,
  SCXMLErrorKind,
  SCXMLSession,
  SendEvent,
} from '@tinyactors/scxmljs/trusted'
import {
  fitData,
  levelOf,
  truncateText,
  type LogLevel,
  type LogSource,
  type SimLogEntry,
} from '../core/log'
import {
  createEngineSession,
  loadEngine,
  type EngineMode,
} from './engine-loader'

/** 运行日志条目（仿真面板展示用；类型定义在 core/log，见 P19） */
export type { SimLogEntry }

/** 一次微步实际发生的转移（引擎侧状态 id），供画布闪烁连线 */
export interface FiredPair {
  sourceId: string
  targetId: string
}

/** 一次 <send> 被引擎派发（已过 delay；delay=0 时在微步内同步派发）。 */
export interface RunnerSendEvent {
  type: 'send'
  /** 事件名；非 SCXML 处理器可能为空串 */
  name: string
  /** <send> 载荷；未提供时 undefined */
  data?: unknown
  /**
   * 目标，原样透传：
   * '' 默认（外部 / 自身队列）、'#_internal'、'#_parent'、'#_scxml_<sessionId>'、
   * invoke id 或自定义 URI
   */
  target: string
  /** <send id> / idlocation；仅声明时存在（匿名延时发送没有） */
  sendid?: string
}

/** 会话到达顶层终态；引擎 status 变为 done，但 runner.running 仍为 true 直到 stop()。 */
export interface RunnerDoneEvent {
  type: 'done'
  /** 顶层 final 的 <donedata>；cancel 后恒为 undefined */
  data: unknown
  /** 进入终态前的最后一批 entered 状态（至少包含顶层 final 的 id） */
  states: string[]
}

/** 会话抛出 SCXML 错误事件（不一定是致命错误，图表仍可 transition on error.*）。 */
export interface RunnerErrorEvent {
  type: 'error'
  /** error.execution | error.communication | error.platform */
  kind: SCXMLErrorKind
  /** 人读信息，格式不承诺稳定 */
  message: string
  /** 出错元素最近的 state/parallel/final/history id（能定位时） */
  stateId?: string
  /** 转移动作出错时的 transition id（依赖 SCXML 的 data-kit-transition-id） */
  transitionId?: string
  /** 出错动作所在槽位 */
  slot?: 'entry' | 'exit' | 'transition'
  /** 动作在所在容器中的序号 */
  actionIndex?: number
  /** 出错元素的可序列化描述；宿主无需依赖 DOM */
  element?: { localName: string; id?: string }
}

/** 从引擎错误元素提取文档定位信息；找不到就不填可选字段。 */
function errorElementInfo(element: Element | null): Partial<RunnerErrorEvent> {
  if (!element) return {}
  const info: Partial<RunnerErrorEvent> = {
    element: {
      localName: element.localName,
      ...(element.getAttribute('id') ? { id: element.getAttribute('id')! } : {}),
    },
  }
  const stateEl = element.closest('state,parallel,final,history')
  const stateId = stateEl?.getAttribute('id')
  if (stateId) info.stateId = stateId
  const slotEl = element.closest('onentry,onexit,transition')
  const slotTag = slotEl?.tagName.toLowerCase()
  if (slotTag === 'onentry') info.slot = 'entry'
  else if (slotTag === 'onexit') info.slot = 'exit'
  else if (slotTag === 'transition' && slotEl) {
    info.slot = 'transition'
    const transitionId = slotEl.getAttribute('data-kit-transition-id')
    if (transitionId) info.transitionId = transitionId
  }
  const parent = element.parentElement
  if (parent) {
    const index = Array.from(parent.children).indexOf(element)
    if (index >= 0) info.actionIndex = index
  }
  return info
}

export interface RunnerLogEvent {
  type: 'log'
  entry: SimLogEntry
}

export interface RunnerStoppedEvent {
  type: 'stopped'
}

/** runner → store 的回调事件 */
export type RunnerEvent =
  | { type: 'active'; ids: string[] }
  | { type: 'fired'; pairs: FiredPair[] }
  | RunnerSendEvent
  | RunnerDoneEvent
  | RunnerErrorEvent
  | RunnerLogEvent
  | RunnerStoppedEvent

type Listener = (ev: RunnerEvent) => void

/** 宿主侧的变量写入结果（只返回 code/params，由宿主本地化） */
export type VariableWriteResult =
  | {
      ok: true
      code: 'variable.assign-expr' | 'variable.assign-value'
      params: Record<string, unknown>
    }
  | {
      ok: false
      code: 'variable.session-not-running' | 'variable.unknown' | 'variable.assign-failed'
      params: Record<string, unknown>
    }

export interface SessionRunnerOptions {
  /**
   * Node 环境解析 SCXML 文本所需（happy-dom / linkedom 的 DOMParser 实例）；
   * 浏览器可省略（使用全局 DOMParser）。服务端（MachineManager）必须注入。
   */
  domParser?: DOMParserLike
  /** 数据模型入口；默认 `sandboxed`。trusted 只用于完全可信的图表。 */
  engine?: EngineMode
  /** 单次脚本求值超时（ms，sandboxed 有效；引擎默认 2000）。 */
  scriptTimeoutMs?: number
  /** 单个宏步的微步上限（防止 UI 被无事件自环卡死；引擎默认 100000）。 */
  maxMicrosteps?: number
  /** QuickJS 会话内存上限（字节，sandboxed 有效；引擎默认 64 MiB）。 */
  memoryLimitBytes?: number
  /** 会话启动前的 `<data>` 初始值（持久化变量恢复）；`start()` 的 data 会浅合并覆盖。 */
  data?: Record<string, unknown>
  /** 宿主监听器抛错时的回调；默认吞掉，避免一个坏监听器影响仿真。 */
  onListenerError?: (error: unknown, event: RunnerEvent) => void
}

export interface StartOptions {
  /** 本次启动的 `<data>` 初始值，浅合并覆盖构造器 options.data。 */
  data?: Record<string, unknown>
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export class SessionRunner {
  private session: SCXMLSession | null = null
  private clock: PlaybackClock | null = null
  private off: (() => void)[] = []
  private listeners = new Set<Listener>()
  private _speed = 1
  private readonly _engine: EngineMode
  /** 生命周期令牌：start/stop 递增；旧 start 完成后据此丢弃会话 */
  private generation = 0

  constructor(private opts: SessionRunnerOptions = {}) {
    this._engine = opts.engine ?? 'sandboxed'
  }

  /** 是否有会话（含已到达终态但尚未 stop 的会话） */
  get running(): boolean {
    return !!this.session
  }
  /** 会话真实状态；没有会话时为 idle */
  get status(): 'idle' | 'running' | 'done' {
    return this.session?.status ?? 'idle'
  }
  get sessionOrNull(): SCXMLSession | null {
    return this.session
  }
  get speed(): number {
    return this._speed
  }
  get engineMode(): EngineMode {
    return this._engine
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
    // 先复制：监听器里 on/off/stop 不会改变本次派发
    for (const l of [...this.listeners]) {
      try {
        l(ev)
      } catch (err) {
        try {
          this.opts.onListenerError?.(err, ev)
        } catch {
          /* 错误回调本身也不能影响仿真 */
        }
      }
    }
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

  /** 启动会话：旧会话先销毁；source 为 SCXML 文本。 */
  async start(source: string, opts: StartOptions = {}): Promise<void> {
    const generation = ++this.generation
    await this.disposeCurrent()
    // disposeCurrent 是同步的，但 await 让出过一次；期间可能已有新的 start/stop
    if (generation !== this.generation) return

    let clock: PlaybackClock | null = null
    let session: SCXMLSession | null = null
    try {
      // 用会话同一入口的 PlaybackClock：不静态 import 任一引擎，保持入口轻量
      const mod = await loadEngine(this._engine)
      if (generation !== this.generation) return
      clock = new mod.PlaybackClock({ speed: this._speed })
      const data = { ...(this.opts.data ?? {}), ...(opts.data ?? {}) }
      session = await createEngineSession(source, {
        engine: this._engine,
        clock,
        ...(this.opts.domParser ? { domParser: this.opts.domParser } : {}),
        ...(Object.keys(data).length ? { data } : {}),
        ...(this.opts.scriptTimeoutMs !== undefined
          ? { scriptTimeoutMs: this.opts.scriptTimeoutMs }
          : {}),
        ...(this.opts.maxMicrosteps !== undefined
          ? { maxMicrosteps: this.opts.maxMicrosteps }
          : {}),
        ...(this.opts.memoryLimitBytes !== undefined
          ? { memoryLimitBytes: this.opts.memoryLimitBytes }
          : {}),
      })
    } catch (err) {
      clock?.dispose()
      if (generation !== this.generation) return
      this.log('error', `会话创建失败：${errorMessage(err)}`)
      throw err
    }

    if (!session || !clock || generation !== this.generation) {
      session?.dispose()
      clock?.dispose()
      return
    }

    let sawMacrostep = false
    let doneSeen = false
    let lastEntered: string[] = []
    const current = (): boolean =>
      this.session === session && generation === this.generation

    const onMacro = (): void => {
      if (!current() || doneSeen) return
      sawMacrostep = true
      this.emit({ type: 'active', ids: session.activeStateIds() })
    }
    const onMicro = (e: MicrostepEvent): void => {
      if (!current()) return
      const pairs: FiredPair[] = []
      for (const t of e.transitions) {
        for (const target of t.targets) {
          pairs.push({ sourceId: t.source.id || '?', targetId: target.id })
        }
      }
      const entered = e.entered.map((state) => state.id).filter(Boolean)
      if (entered.length) lastEntered = entered
      if (pairs.length) this.emit({ type: 'fired', pairs })
    }
    const onLog = (e: LogEvent): void => {
      if (!current()) return
      // text 只放正文；kind 由展示层统一显示，避免出现 [log] [log]
      const label = e.label && e.label !== 'log' ? `[${e.label}] ` : ''
      this.log('log', `${label}${String(e.value ?? '')}`)
    }
    const onError = (e: SCXMLErrorEvent): void => {
      if (!current()) return
      this.log('error', `${e.kind}: ${e.message}`)
      this.emit({ type: 'error', kind: e.kind, message: e.message, ...errorElementInfo(e.element) })
    }
    const onDone = (e: DoneEvent): void => {
      if (!current()) return
      const states = lastEntered.length ? [...lastEntered] : session.activeStateIds()
      doneSeen = true
      if (states.length) this.emit({ type: 'active', ids: states })
      this.log('lifecycle', '会话已到达终态结束')
      this.emit({ type: 'done', data: e.data, states })
    }
    const onSendEv = (e: SendEvent): void => {
      if (!current()) return
      // 图内 <send> 是真正的“发送事件”（MQTT 出向桥也会拦截同一事件）
      const name = e.message.event
      const data = e.message.data
      this.log(
        'send',
        `发送事件 ${name}${data !== undefined ? ` ${JSON.stringify(data)}` : ''}`,
        { data },
      )
      this.emit({
        type: 'send',
        name,
        data,
        target: e.message.target,
        ...(e.message.sendid !== undefined ? { sendid: e.message.sendid } : {}),
      })
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

    try {
      session.start()
    } catch (err) {
      await this.disposeCurrent()
      if (generation !== this.generation) return
      this.log('error', `会话启动失败：${errorMessage(err)}`)
      throw err
    }

    // 宿主监听器可能在初始 macrostep 里同步 stop/start；此时不再写“已启动”
    if (!current()) return
    // start() 正常会同步派发一次 macrostep；空图等边界情况兜底一次 active
    if (!sawMacrostep && !doneSeen) {
      this.emit({ type: 'active', ids: session.activeStateIds() })
    }
    this.log(
      'lifecycle',
      `会话已启动（${this._engine === 'trusted' ? 'trusted' : 'sandboxed'} 数据模型）`,
    )
  }

  /** 暂停回放时钟；未运行时返回 false（不写误导性日志） */
  pause(): boolean {
    if (!this.clock) return false
    this.clock.pause()
    this.log('lifecycle', '已暂停')
    return true
  }

  /** 继续回放时钟；未运行时返回 false */
  play(): boolean {
    if (!this.clock) return false
    this.clock.play()
    this.log('lifecycle', '继续运行')
    return true
  }

  /** 是否处于暂停（未在播放）；无会话时为 false */
  get paused(): boolean {
    return this.clock ? !this.clock.playing : false
  }

  /** 单步执行；返回实际执行的任务数（未运行时 0） */
  step(): number {
    if (!this.clock) return 0
    const n = this.clock.step()
    this.log('lifecycle', `单步（执行 ${n} 个任务）`)
    return n
  }

  /** 设置回放速度（负数/NaN 归零）；返回实际生效值 */
  setSpeed(n: number): number {
    const speed = Number.isFinite(n) ? Math.max(0, n) : 0
    this._speed = speed
    if (this.clock) this.clock.speed = speed
    if (this.session) this.log('lifecycle', `速度 = ${speed}x`)
    return speed
  }

  /**
   * 注入外部事件（进入会话的外部队列）；返回是否成功入队。
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
  ): boolean {
    if (!this.session) return false
    try {
      this.session.send(name, data)
      if (logText !== null) {
        const action = logKind === 'send' ? '发送' : '接收'
        let text =
          logText ?? `${action}事件 ${name}${data !== undefined ? ` ${JSON.stringify(data)}` : ''}`
        if (source) text += `（${source}）`
        this.log(logKind, text, { data })
      }
      return true
    } catch (e) {
      this.log('error', `发送 ${name} 失败：${errorMessage(e)}`)
      return false
    }
  }

  /**
   * 读取数据模型变量；未运行时返回 null。
   * @deprecated 新代码用 `snapshot()`（未运行时返回 `{}`，语义一致且不做 null 分支）。
   */
  readVariables(): Record<string, unknown> | null {
    if (!this.session) return null
    try {
      return this.session.snapshot()
    } catch {
      return null
    }
  }

  /** 宿主侧修改变量（JS 表达式在引擎内求值赋值，走官方 DataModel.assignExpr） */
  assignVariable(id: string, expr: string): VariableWriteResult {
    const session = this.session
    if (!session) {
      return { ok: false, code: 'variable.session-not-running', params: { id } }
    }
    try {
      if (!session.datamodel.isValidLocation(id)) {
        return { ok: false, code: 'variable.unknown', params: { id } }
      }
      session.datamodel.assignExpr(id, expr)
      return { ok: true, code: 'variable.assign-expr', params: { id, expr } }
    } catch (err) {
      return {
        ok: false,
        code: 'variable.assign-failed',
        params: { id, detail: errorMessage(err) },
      }
    }
  }

  /** 宿主侧直接写入值（不经表达式求值；keepVars 迁移用） */
  assignValue(id: string, value: unknown): VariableWriteResult {
    const session = this.session
    if (!session) {
      return { ok: false, code: 'variable.session-not-running', params: { id } }
    }
    try {
      if (!session.datamodel.isValidLocation(id)) {
        return { ok: false, code: 'variable.unknown', params: { id } }
      }
      session.datamodel.assignValue(id, value)
      return { ok: true, code: 'variable.assign-value', params: { id, value } }
    } catch (err) {
      return {
        ok: false,
        code: 'variable.assign-failed',
        params: { id, detail: errorMessage(err) },
      }
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

  /** 等待会话进入空闲（宏步队列清空）；未运行时立即 resolve */
  settled(): Promise<void> {
    return this.session?.settled() ?? Promise.resolve()
  }

  /** 停止并销毁会话（引擎要求宿主负责 dispose） */
  async stop(): Promise<void> {
    this.generation++
    await this.disposeCurrent()
  }

  /** 销毁当前会话（不递增 generation；由 start/stop 调用） */
  private async disposeCurrent(): Promise<void> {
    const session = this.session
    const clock = this.clock
    const off = this.off
    this.session = null
    this.clock = null
    this.off = []
    for (const fn of off) {
      try {
        fn()
      } catch {
        /* 监听器清理失败不应阻止 dispose */
      }
    }
    if (!session) {
      clock?.dispose()
      return
    }
    try {
      session.dispose()
    } catch {
      /* dispose 幂等 */
    }
    clock?.dispose()
    this.log('lifecycle', '会话已停止')
    this.emit({ type: 'stopped' })
  }
}
