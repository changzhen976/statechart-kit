/**
 * 引擎懒加载器（P2）。
 *
 * 背景：两套数据模型共用同一套解释器 API，但入口不同——
 *   - `@tinyactors/scxmljs`          → sandboxed（QuickJS/WASM，用户图表）
 *   - `@tinyactors/scxmljs/trusted`  → trusted（宿主 JS realm，可信图表）
 *
 * 两者都是 ESM，且 sandboxed 还会按需加载约 290KB 的 QuickJS WASM。静态 import 任一
 * 入口都会把体积/初始化成本压给所有消费者，因此这里统一成一个按 mode 缓存的懒加载器：
 *
 *   - `loadEngine(mode)`     只加载 ESM 模块；
 *   - `preloadEngine(mode)`  额外预热 QuickJS（sandboxed）；
 *   - `createEngineSession()` 模块 + 选项合并，供 SessionRunner / Node-RED 直接使用；
 *   - `validateScxml()` 复用同一个 trusted 模块做 parse/compile，不再单独 import。
 *
 * 失败缓存会被清除：一次网络/加载失败不会永久毒化后续启动。
 */
import type {
  DOMParserLike,
  Loader,
  Model,
  PlaybackClock,
  SCXMLSession,
  SessionOptions,
} from '@tinyactors/scxmljs/trusted'
import { neutralizeCdata } from '../core/cdata'

export type EngineMode = 'sandboxed' | 'trusted'

/** 两个入口共同导出的最小 API 面（类型来自 trusted 入口，运行时由 mode 决定） */
export interface EngineModule {
  createSession(
    source: string | Element | Model,
    opts?: SessionOptions,
  ): Promise<SCXMLSession>
  parseSCXML(source: string, domParser?: DOMParserLike): Element
  compile(root: Element, opts?: { loader?: Loader }): Model | Promise<Model>
  /** 回放时钟由两个入口共同导出；用会话所属入口构造，避免额外静态依赖 */
  PlaybackClock: new (opts?: { speed?: number; playing?: boolean }) => PlaybackClock
  /** 仅 sandboxed 入口导出；trusted 没有 QuickJS 可预热 */
  loadQuickJS?(): Promise<void>
}

const modules = new Map<EngineMode, Promise<EngineModule>>()

function assertMode(mode: string): asserts mode is EngineMode {
  if (mode !== 'sandboxed' && mode !== 'trusted') {
    throw new TypeError(`engine must be "sandboxed" or "trusted", got ${JSON.stringify(mode)}`)
  }
}

/** 懒加载引擎入口；同一 mode 的并发调用共享同一个 Promise。 */
export function loadEngine(mode: EngineMode = 'sandboxed'): Promise<EngineModule> {
  assertMode(mode)
  const cached = modules.get(mode)
  if (cached) return cached
  const loading = (
    mode === 'trusted'
      ? import('@tinyactors/scxmljs/trusted')
      : import('@tinyactors/scxmljs')
  ) as unknown as Promise<EngineModule>
  const guarded = loading.catch((err: unknown) => {
    // 模块加载失败（离线、缓存损坏等）不应永久缓存
    modules.delete(mode)
    throw err
  })
  modules.set(mode, guarded)
  return guarded
}

/**
 * 加载并预热引擎：sandboxed 会等 QuickJS WASM 就绪，首次 `start()` 不再有额外延迟。
 * 适合在“打开仿真面板/部署机器”时提前调用。
 */
export async function preloadEngine(mode: EngineMode = 'sandboxed'): Promise<EngineModule> {
  const mod = await loadEngine(mode)
  if (mode === 'sandboxed') await mod.loadQuickJS?.()
  return mod
}

function assertPositive(
  name: string,
  value: number | undefined,
  opts: { integer?: boolean } = {},
): void {
  if (value === undefined) return
  if (!Number.isFinite(value) || value <= 0 || (opts.integer && !Number.isInteger(value))) {
    throw new RangeError(
      `${name} must be a positive ${opts.integer ? 'integer' : 'number'}, got ${String(value)}`,
    )
  }
}

/** 校验并规范化引擎选项（timeout/microsteps/memory）；无效值尽早抛错而不是交给引擎。 */
export function normalizeEngineOptions(opts: EngineSessionOptions): EngineSessionOptions {
  assertPositive('scriptTimeoutMs', opts.scriptTimeoutMs)
  assertPositive('maxMicrosteps', opts.maxMicrosteps, { integer: true })
  assertPositive('memoryLimitBytes', opts.memoryLimitBytes, { integer: true })
  if (opts.data !== undefined && (opts.data === null || typeof opts.data !== 'object')) {
    throw new TypeError('data must be a plain object of initial variable values')
  }
  return opts
}

export interface EngineSessionOptions extends SessionOptions {
  /** 数据模型；默认 sandboxed（用户图表），只有可信图表才应选择 trusted */
  engine?: EngineMode
}

/**
 * 按需加载对应引擎并创建会话（未 start）。
 *
 * `data` 是引擎的 `<data>` 初始值覆盖：用于在 start 前恢复持久化变量，
 * 避免先 start 再 assignValue 触发多余的 entry/宏步。
 */
export async function createEngineSession(
  source: string | Element | Model,
  opts: EngineSessionOptions = {},
): Promise<SCXMLSession> {
  const { engine = 'sandboxed', ...sessionOptions } = normalizeEngineOptions(opts)
  const mod = await loadEngine(engine)
  // happy-dom 等解析器对 script CDATA 兼容性差；中和后 textContent 不变，
  // 浏览器与 Node 都能解析（compile/运行语义一致）。
  const prepared = typeof source === 'string' ? neutralizeCdata(source) : source
  return mod.createSession(prepared, sessionOptions)
}
