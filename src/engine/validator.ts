/**
 * 引擎层校验（`statechart-kit/engine`）。
 *
 * P1 校验分层的第二层：把序列化产物交给 scxmljs 引擎干跑（parse + compile），
 * 在真正启动会话前发现语法/结构错误。core 的 `validateStructure` 不依赖引擎；
 * `validateDocument` 把两层串起来（结构 → 命名 → 引擎）。
 *
 * 诊断只返回 `{ code, params }`；引擎自身抛出的错误文本放在 `params.detail`，
 * 宿主按 code 本地化或原样展示 detail。
 */
import type { DOMParserLike } from '@tinyactors/scxmljs/trusted'
import type { ProjectDoc } from '../core/model'
import { serializeToScxml } from '../core/serializer'
import { scanScriptActions, type ScriptActionHit } from '../core/action-parse'
import type { StructureIssue } from '../core/validate-structure'
import { validateStructure } from '../core/validate-structure'
import type { DocNamingIssue } from '../core/naming'
import { checkDocNaming } from '../core/naming'
import type { NamingPolicy } from '../core/naming-policy'
import { BASE_POLICY } from '../core/naming-policy'
import { neutralizeCdata } from '../core/cdata'
import { loadEngine } from './engine-loader'

export type ValidationIssueKind =
  | 'state'
  | 'transition'
  | 'script'
  | 'xml'
  | 'generic'
  | 'structure'
  | 'naming'

/** 单条校验问题（弹窗逐条展示 + 尽量定位到文档对象） */
export interface ValidationIssue {
  code: string
  params: Record<string, unknown>
  severity?: 'error' | 'warning'
  /** 定位类别：结构 / 命名 / 状态 / 转移 / 自定义 JS / XML 解析 / 通用 */
  kind: ValidationIssueKind
  /** 状态 SCXML id（映射 doc.states） */
  stateId?: string
  /** 状态内部 uid */
  stateUid?: string
  /** 转移事件名（配合 stateId 定位转移行） */
  event?: string
  /** 转移内部 id */
  transitionId?: string
  /** 动作槽位 */
  slot?: 'entry' | 'exit' | 'transition'
  /** 动作行号（1 起） */
  actionIndex?: number
  /** XML 解析错误的行/列（1 起） */
  line?: number
  column?: number
}

export interface ValidationResult {
  ok: boolean
  /** 逐条问题（失败时由结构/命名/引擎提取） */
  issues: ValidationIssue[]
  /** 失败时保留序列化产物，供 XML 片段展示（成功时不保留） */
  source?: string
}

export interface ValidateOptions {
  /** Node 环境必须注入（happy-dom / linkedom）；浏览器可省略 */
  domParser?: DOMParserLike
  /** 命名策略；缺省 `BASE_POLICY`（无前缀规则） */
  policy?: NamingPolicy
}

/**
 * 校验 SCXML 文本；成功 `ok=true`，失败携带逐条 issues 与原始 source。
 * domParser：Node 环境必须注入（happy-dom / linkedom）；浏览器可省略（全局 DOMParser）。
 */
export async function validateScxml(
  source: string,
  domParser?: DOMParserLike,
): Promise<ValidationResult> {
  try {
    // 与 SessionRunner 共用懒加载器：validate 不再静态 import 引擎入口
    const { parseSCXML, compile } = await loadEngine('trusted')
    // happy-dom 等 Node 解析器对 <script><![CDATA[…]]></script> 兼容性差；
    // compile 只读文本、不执行脚本，先中和 CDATA 可让校验在 Node 下同样可靠。
    const parsed = parseSCXML(neutralizeCdata(source), domParser)
    await compile(parsed)
    return { ok: true, issues: [] }
  } catch (err) {
    return { ok: false, issues: issuesFromError(err), source }
  }
}

/**
 * 从引擎错误提取逐条 issues：
 * - SCXMLValidationError.problems[]（compile 结构错误）→ 逐条 + 正则定位；
 * - SCXMLParseError / message 含 "line N at column M" → xml 类；
 * - 兜底：整条 message 作为 generic 单条。
 */
export function issuesFromError(err: unknown): ValidationIssue[] {
  const e = err as { name?: string; message?: string; problems?: unknown } | null
  const problems = Array.isArray(e?.problems) ? (e!.problems as unknown[]) : null
  if (problems && problems.length) {
    return problems.map((p) => {
      const detail = typeof p === 'string' ? p : JSON.stringify(p)
      return issueFromMessage(detail, 'validation.engine.problem')
    })
  }
  return [issueFromMessage(e?.message ?? String(err), 'validation.engine.error')]
}

function issueFromMessage(detail: string, code: string): ValidationIssue {
  const issue: ValidationIssue = {
    code,
    params: { detail },
    severity: 'error',
    kind: 'generic',
  }
  const m = detail.match(/line (\d+)(?: at column (\d+))?/i)
  if (m) {
    issue.kind = 'xml'
    issue.line = Number(m[1])
    if (m[2]) issue.column = Number(m[2])
  }
  return issue
}

/**
 * script 命中（scanScriptActions）→ issues（状态 + entry/exit/转移 + 第 N 行）。
 * 唯一实现——store 校验弹窗与 service 部署闸门共用，勿再内联复制。
 */
export function scriptHitsToIssues(hits: ScriptActionHit[]): ValidationIssue[] {
  return hits.map((h) => ({
    code: 'validation.script-action',
    params: {
      slot: h.slot,
      event: h.event ?? '',
      index: h.index,
      line: h.line,
    },
    severity: 'error',
    kind: 'script',
    stateId: h.stateId,
    stateUid: h.stateUid,
    slot: h.slot,
    actionIndex: h.index,
    ...(h.event !== undefined ? { event: h.event } : {}),
  }))
}

/**
 * 用文档对象给 issues 补定位（状态 id / 转移事件）。
 * 引擎 problems 里常见的 "in \"x\""、"unknown target \"y\""、"duplicate id \"z\""。
 */
export function locateIssues(issues: ValidationIssue[], doc: ProjectDoc): ValidationIssue[] {
  return issues.map((iss) => {
    if (iss.kind !== 'generic') return iss
    const detail = typeof iss.params.detail === 'string' ? iss.params.detail : ''
    const tokens = [...detail.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)
    const out: ValidationIssue = { ...iss }
    const evTok = tokens.find((t) => doc.transitions.some((tr) => tr.event === t))
    const stTok = tokens.find((t) => doc.states.some((s) => s.id === t))
    if (evTok) {
      out.kind = 'transition'
      out.event = evTok
      if (stTok) out.stateId = stTok
    } else if (stTok) {
      out.kind = 'state'
      out.stateId = stTok
    }
    return out
  })
}

/** 结构问题 → 统一 ValidationIssue */
export function structureIssuesToValidation(issues: StructureIssue[]): ValidationIssue[] {
  return issues.map((i) => ({
    code: i.code,
    params: { ...(i.params ?? {}) },
    severity: i.severity,
    kind: 'structure',
    ...(i.stateId !== undefined ? { stateId: i.stateId } : {}),
    ...(i.stateUid !== undefined ? { stateUid: i.stateUid } : {}),
    ...(i.transitionId !== undefined ? { transitionId: i.transitionId } : {}),
    ...(i.variableId !== undefined ? { variableId: i.variableId } : {}),
  }))
}

/** 文档级命名问题 → 统一 ValidationIssue */
export function namingIssueToValidation(issue: DocNamingIssue): ValidationIssue {
  const out: ValidationIssue = {
    code: issue.code,
    params: { ...issue.params },
    severity: issue.level === 'block' ? 'error' : 'warning',
    kind: 'naming',
  }
  if (issue.target.kind === 'state') {
    out.stateId = issue.target.stateId
    out.stateUid = issue.target.stateUid
    out.slot = issue.target.slot
    out.actionIndex = issue.target.actionIndex
  } else if (issue.target.kind === 'transition') {
    out.transitionId = issue.target.transitionId
    out.event = issue.target.event
    if (issue.target.actionIndex !== undefined) out.actionIndex = issue.target.actionIndex
  } else {
    out.params.index = issue.target.index
  }
  return out
}

/** 只跑引擎层（序列化 + parse/compile），不跑结构/命名校验 */
export async function validateAgainstEngine(
  doc: ProjectDoc,
  opts: Omit<ValidateOptions, 'policy'> = {},
): Promise<ValidationResult> {
  const source = serializeToScxml(doc)
  const result = await validateScxml(source, opts.domParser)
  if (result.ok) return { ok: true, issues: [] }
  return { ok: false, issues: locateIssues(result.issues, doc), source }
}

/**
 * 完整校验：结构（core）→ 命名（策略）→ 引擎（parse+compile）。
 * 结构/命名有 error 时不跑引擎，避免把同一个问题重复报两遍。
 */
export async function validateDocument(
  doc: ProjectDoc,
  opts: ValidateOptions = {},
): Promise<ValidationResult> {
  const policy = opts.policy ?? BASE_POLICY
  const issues = structureIssuesToValidation(validateStructure(doc).issues)
  const naming = checkDocNaming(policy, doc)
  if (naming) issues.push(namingIssueToValidation(naming))

  const blocked = issues.some((i) => i.severity === 'error')
  if (blocked) {
    return { ok: false, issues, source: serializeToScxml(doc) }
  }

  const engine = await validateAgainstEngine(doc, opts)
  issues.push(...engine.issues)
  return engine.ok
    ? { ok: true, issues }
    : { ok: false, issues, ...(engine.source !== undefined ? { source: engine.source } : {}) }
}
