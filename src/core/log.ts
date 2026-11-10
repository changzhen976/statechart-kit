/**
 * 日志条目模型（P19）。
 *
 * - 内存条目 `SimLogEntry` 保留 `time` 字段（引擎/前端已有代码零迁移）；
 * - 落盘/API 条目 `LogEntry` 统一用 `ts`，不再出现 `t`/`time` 双字段；
 * - `source` 区分 run（引擎/服务运行）、ui（编辑器校验/文件操作）、system（服务运维）；
 * - `level` 缺省由 kind 推导（error → error），也可显式指定；
 * - 文本/结构化 data 单条上限 2KB（防长 payload 刷爆 JSONL 行）。
 */
export type LogLevel = 'info' | 'warn' | 'error'
export type LogSource = 'run' | 'ui' | 'system'
export type LogKind =
  | 'macrostep'
  | 'microstep'
  | 'send'
  | 'inject'
  | 'error'
  | 'lifecycle'
  | 'log'
  // 服务级（service.jsonl）
  | 'deploy'
  | 'restart'
  | 'mqtt'
  | 'system'

/** 内存条目（引擎 → store；保留 time 字段兼容现有代码） */
export interface SimLogEntry {
  time: number
  kind: LogKind
  text: string
  level?: LogLevel
  source?: LogSource
  data?: unknown
}

/** 落盘/API 条目（统一 ts；machineId 由 LogService 补齐） */
export interface LogEntry {
  ts: number
  level: LogLevel
  kind: LogKind
  source: LogSource
  machineId?: string
  text: string
  data?: unknown
}

/** LogView 组件入参（服务端 LogEntry 与本地 SimLogEntry 归一后的形状） */
export interface LogViewItem {
  ts: number
  kind: string
  text: string
  level?: LogLevel
  source?: LogSource
  data?: unknown
}

export const LOG_TEXT_MAX = 2048
export const LOG_DATA_MAX = 2048

export function truncateText(text: string, max = LOG_TEXT_MAX): string {
  if (text.length <= max) return text
  // 只做安全截断，不带本地化文案（截断提示由宿主决定是否展示）
  return `${text.slice(0, max)}…`
}

/** data 超限时降级为可读摘要，避免单行 JSONL 过大 */
export function fitData(data: unknown, max = LOG_DATA_MAX): unknown {
  if (data === undefined) return undefined
  let json: string
  try {
    json = JSON.stringify(data)
  } catch {
    return String(data)
  }
  if (json.length <= max) return data
  return { truncated: true, length: json.length, preview: `${json.slice(0, max - 40)}…` }
}

export function levelOf(kind: LogKind, level?: LogLevel): LogLevel {
  return level ?? (kind === 'error' ? 'error' : 'info')
}

/** 内存条目 → 落盘/API 条目 */
export function toLogEntry(
  entry: SimLogEntry,
  machineId?: string,
  fallbackSource: LogSource = 'run',
): LogEntry {
  const e: LogEntry = {
    ts: entry.time,
    level: levelOf(entry.kind, entry.level),
    kind: entry.kind,
    source: entry.source ?? fallbackSource,
    text: truncateText(entry.text),
  }
  if (machineId) e.machineId = machineId
  if (entry.data !== undefined) e.data = fitData(entry.data)
  return e
}

/** 本地 SimLogEntry → LogViewItem */
export function toLogViewItem(entry: SimLogEntry): LogViewItem {
  return {
    ts: entry.time,
    kind: entry.kind,
    text: entry.text,
    level: levelOf(entry.kind, entry.level),
    source: entry.source ?? 'run',
    ...(entry.data !== undefined ? { data: entry.data } : {}),
  }
}

/**
 * 旧 JSONL 兼容：`{t, kind, text}` 升格为 `{ts, level, source, ...}`；
 * 新格式原样接受。无法解析返回 null（调用方跳过该行）。
 */
export function normalizeLogEntry(raw: unknown, machineId?: string): LogEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const ts = typeof o.ts === 'number' ? o.ts : typeof o.t === 'number' ? o.t : null
  if (ts === null || typeof o.kind !== 'string' || typeof o.text !== 'string') return null
  const kind = o.kind as LogKind
  const e: LogEntry = {
    ts,
    level: (o.level as LogLevel) ?? (kind === 'error' ? 'error' : 'info'),
    kind,
    source: (o.source as LogSource) ?? 'run',
    text: o.text,
  }
  if (typeof o.machineId === 'string') e.machineId = o.machineId
  else if (machineId) e.machineId = machineId
  if (o.data !== undefined) e.data = o.data
  return e
}

/**
 * 日志展示格式化。
 *
 * `text` 约定只存消息正文，`kind` 由展示层渲染；旧版本曾在 log 文本里多写一个
 * `[log]` 前缀，这里做兼容剥离，避免历史 JSONL 显示成 `[log] [log] ...`。
 */
export function displayLogText(kind: string, text: string): string {
  if (kind !== 'log') return text
  return text.replace(/^\[log\]\s+/, '')
}
