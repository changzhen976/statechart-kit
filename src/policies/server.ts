/**
 * 服务端命名策略预设（`statechart-kit/policies/server`）。
 *
 * 这是 `scxml-creator` / `node-red-contrib-scxmljs` 现有命名约定的**兼容预设**：
 * `gv_` 全局变量、`ge_` 全局（广播）事件、`t_` 时钟事件、`mqe_`/`mqv_` MQTT
 * 边界事件/本地变量、`sys.` 系统事件、`g_` v1 遗留前缀。
 *
 * 它**不属于 core 入口**：core 只提供 `BASE_POLICY`。宿主可以整套替换，或在
 * `SERVER_POLICY` 基础上增删命名空间。P4/P5 切换后可把本文件搬回宿主。
 */
import type { NamingNamespace, NamingPolicy } from '../core/naming-policy'

const P_GV = 'gv_'
const P_GE = 'ge_'
const P_T = 't_'
const P_MQE = 'mqe_'
const P_MQV = 'mqv_'
const P_SYS = 'sys.'
const P_LEGACY = 'g_'

const NAMESPACES: readonly NamingNamespace[] = [
  {
    key: 'globalVar',
    prefix: P_GV,
    event: 'block',
    variable: 'allow',
  },
  {
    key: 'globalEvent',
    prefix: P_GE,
    event: 'allow',
    variable: 'block',
    broadcast: true,
    routeReserved: true,
  },
  {
    key: 'clockEvent',
    prefix: P_T,
    event: 'block',
    variable: 'block',
    routeReserved: true,
    sendBlocked: true,
  },
  {
    key: 'mqttEvent',
    prefix: P_MQE,
    event: 'allow',
    variable: 'block',
  },
  {
    key: 'mqttVar',
    prefix: P_MQV,
    event: 'block',
    variable: 'warn',
    warnCode: 'naming.mqtt-var.requires-machine',
  },
  {
    key: 'systemEvent',
    prefix: P_SYS,
    event: 'block',
    variable: 'block',
    routeReserved: true,
    sendBlocked: true,
  },
  {
    key: 'legacyGlobal',
    prefix: P_LEGACY,
    event: 'block',
    variable: 'block',
    legacy: true,
    routeReserved: true,
    sendBlocked: true,
    assignBlocked: true,
  },
]

/** v1 遗留判断：`g_` 开头但不是 v2 的 `gv_`/`ge_` */
function isLegacyGlobal(name: string): boolean {
  return name.startsWith(P_LEGACY) && !name.startsWith(P_GV) && !name.startsWith(P_GE)
}

/**
 * 与 scxml-creator `src/core/naming.ts` 等价的 v1 → v2 迁移：
 *   g_tick_*    → t_*
 *   g_changed.* → sys.changed.*
 *   事件上下文 g_* → ge_*
 *   变量上下文 g_* → gv_*
 */
const migration: NonNullable<NamingPolicy['migration']> = {
  eventName(name) {
    const tick = name.match(/^g_tick_(.+)$/)
    if (tick) return `${P_T}${tick[1]}`
    if (name.startsWith('g_changed.')) {
      return `${P_SYS}changed.${name.slice('g_changed.'.length)}`
    }
    if (isLegacyGlobal(name)) return P_GE + name.slice(P_LEGACY.length)
    return name
  },
  variableName(name) {
    return isLegacyGlobal(name) ? P_GV + name.slice(P_LEGACY.length) : name
  },
  expression(expr) {
    return expr.replace(/(?<![A-Za-z0-9_.])g_([A-Za-z_])/g, 'gv_$1')
  },
}

/** 服务端预设：保持 donor 的校验与迁移行为 */
export const SERVER_POLICY: NamingPolicy = {
  key: 'server',
  namespaces: NAMESPACES,
  autoDelayEvents: true,
  migration,
}
