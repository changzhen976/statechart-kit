/**
 * 命名策略：把 `gv_`/`ge_`/`t_`/`mqe_`/`mqv_`/`sys.` 等服务端语义外置为**宿主注入的数据**。
 *
 * core 只提供：
 *   - `NamingPolicy` / `NamingNamespace` 类型；
 *   - 最长前缀匹配、允许/拦截/警告的通用判定（`src/core/naming.ts`）；
 *   - `BASE_POLICY`（无任何前缀，纯通用规则）。
 *
 * 服务端预设（保持 scxml-creator 的既有语义）在 `statechart-kit/policies/server`，
 * 不属于 core 入口；宿主也可以完全自定义策略（例如 `av_`/`ae_` 双前缀）。
 *
 * 判定结果只返回 `{ code, params }`，不返回中文字符串——文案由宿主本地化。
 */

/** 命名规则作用的对象类型 */
export type NamingSubject = 'event' | 'variable'

/** 某个前缀用于某类对象时的处理方式 */
export type NamingDisposition = 'allow' | 'block' | 'warn'

/**
 * 一个命名空间（前缀 + 语义）。
 *
 * 约定：
 * - `event` / `variable` 表示「用户把该前缀用于事件/变量」时的处理方式；
 * - `legacy` 为 v1 遗留前缀，仅在没有匹配到任何非 legacy 前缀时生效
 *   （因此 `gv_x` 命中 `gv_`，不会误判为 `g_`）；
 * - `broadcast` / `routeReserved` / `sendBlocked` / `assignBlocked` 是 core 与宿主共用的
 *   少量语义钩子，避免 core 里出现具体前缀字符串。
 */
export interface NamingNamespace {
  /** 稳定键，出现在诊断 params 中（如 `globalVar`）；宿主据此本地化 */
  key: string
  /** 前缀字面量（非空） */
  prefix: string
  /** 用于事件名时的处理方式 */
  event: NamingDisposition
  /** 用于变量名时的处理方式 */
  variable: NamingDisposition
  /** 该命名空间的事件会广播给所有运行中的机器（事件目录打「广播」标） */
  broadcast?: boolean
  /** 宿主事件路由不能匹配该命名空间（由广播/时钟/系统投递） */
  routeReserved?: boolean
  /** 部署闸门禁止手动 `send` 该命名空间的事件 */
  sendBlocked?: boolean
  /** 部署闸门禁止 `assign` 到该命名空间的变量 */
  assignBlocked?: boolean
  /** v1 遗留前缀（匹配优先级低于所有非 legacy 前缀） */
  legacy?: boolean
  /** 可选提示片段（宿主本地化时使用；core 只透传） */
  hint?: string
  /** `warn` 级别时使用的诊断 code；缺省 `naming.prefix.warn` */
  warnCode?: string
}

/** v1 → v2 迁移钩子；缺省 = 不迁移（恒等） */
export interface NamingMigration {
  eventName?(name: string): string
  variableName?(name: string): string
  /** JS 表达式中的变量引用重写 */
  expression?(expr: string): string
}

/** 宿主注入的命名策略 */
export interface NamingPolicy {
  /** 策略标识（`base` / `server` / 宿主自定义），出现在诊断 params 中 */
  key: string
  namespaces: readonly NamingNamespace[]
  /** 是否按内部延迟事件规则校验 `delay…` 自动名（默认 true） */
  autoDelayEvents?: boolean
  /** 迁移钩子；没有则 `migrate*` 为恒等函数 */
  migration?: NamingMigration
}

/**
 * 通用基线：没有任何前缀命名空间。
 *
 * 只保留与宿主无关的规则：空名、`delay…` 自动事件引用。适合不引入服务端命名约定的
 * 宿主，也作为 `NamingPolicy` 的最小实现参考。
 */
export const BASE_POLICY: NamingPolicy = {
  key: 'base',
  namespaces: [],
  autoDelayEvents: true,
}

/**
 * 最长前缀匹配；非 legacy 优先于 legacy。
 * 同长度多个命中时取声明顺序靠前者。空前缀被忽略（避免匹配一切）。
 */
export function matchNamespace(
  policy: NamingPolicy,
  name: string,
): NamingNamespace | undefined {
  let best: NamingNamespace | undefined
  let legacy: NamingNamespace | undefined
  for (const ns of policy.namespaces) {
    if (!ns.prefix || !name.startsWith(ns.prefix)) continue
    if (ns.legacy) {
      if (!legacy || ns.prefix.length > legacy.prefix.length) legacy = ns
    } else if (!best || ns.prefix.length > best.prefix.length) {
      best = ns
    }
  }
  return best ?? legacy
}

/** 按 key 取命名空间（宿主构造策略后自检、测试用） */
export function namespaceByKey(policy: NamingPolicy, key: string): NamingNamespace | undefined {
  return policy.namespaces.find((ns) => ns.key === key)
}
