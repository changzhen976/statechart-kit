/**
 * 结构校验（core，零运行时依赖）。
 *
 * P1 校验分层的第一层：只检查 `ProjectDoc` 自身的结构完整性，不 import 引擎、
 * 不解析 SCXML。序列化器对缺失引用/非法 id 会静默回退（例如把找不到的状态跳过），
 * 这一层负责在部署/导出前把这些「会丢数据」的文档拦下来。
 *
 * 第二层在 `statechart-kit/engine`：`validateAgainstEngine` 真正 parse + compile SCXML；
 * `validateDocument` 先跑本层，再跑引擎层。
 *
 * 诊断只返回 `{ code, params }`，宿主本地化；`severity==='error'` 表示不能部署/导出。
 */
import type { ProjectDoc, StateNode } from './model'

/** SCXML id 的 NCName 子集（允许 Unicode 字母，兼容中文状态 id） */
export const NCNAME_RE = /^[\p{L}_][\p{L}\p{N}_.-]*$/u

export type StructureSeverity = 'error' | 'warning'

export interface StructureIssue {
  severity: StructureSeverity
  code: string
  params?: Record<string, string | number>
  /** 状态 SCXML id（若可定位） */
  stateId?: string
  /** 状态内部 uid */
  stateUid?: string
  /** 转移内部 id */
  transitionId?: string
  /** datamodel 变量 id */
  variableId?: string
}

export interface StructureReport {
  /** 没有 error 级问题（warning 不阻断） */
  ok: boolean
  issues: StructureIssue[]
}

const isHistory = (s: StateNode): boolean => s.kind === 'history'

/** 校验文档结构；返回全部问题（error 阻断，warning 提示）。 */
export function validateStructure(doc: ProjectDoc): StructureReport {
  const issues: StructureIssue[] = []
  const add = (issue: StructureIssue): void => {
    issues.push(issue)
  }

  const byUid = new Map<string, StateNode>()
  for (const s of doc.states) {
    if (!s.uid) {
      add({
        severity: 'error',
        code: 'structure.state.missing-uid',
        params: { id: s.id },
        stateId: s.id,
      })
      continue
    }
    if (byUid.has(s.uid)) {
      add({
        severity: 'error',
        code: 'structure.state.duplicate-uid',
        params: { uid: s.uid, id: s.id },
        stateId: s.id,
        stateUid: s.uid,
      })
    } else {
      byUid.set(s.uid, s)
    }
  }

  const idSeen = new Set<string>()
  for (const s of doc.states) {
    if (!s.id) {
      add({
        severity: 'error',
        code: 'structure.state.missing-id',
        params: { uid: s.uid },
        stateUid: s.uid,
      })
    } else if (!NCNAME_RE.test(s.id)) {
      add({
        severity: 'error',
        code: 'structure.state.invalid-id',
        params: { id: s.id },
        stateId: s.id,
        stateUid: s.uid,
      })
    } else if (idSeen.has(s.id)) {
      add({
        severity: 'error',
        code: 'structure.state.duplicate-id',
        params: { id: s.id },
        stateId: s.id,
        stateUid: s.uid,
      })
    } else {
      idSeen.add(s.id)
    }
  }

  const varSeen = new Set<string>()
  for (let i = 0; i < doc.datamodel.length; i++) {
    const d = doc.datamodel[i]!
    if (!d.id) {
      add({
        severity: 'error',
        code: 'structure.variable.missing-id',
        params: { index: i },
      })
    } else if (!NCNAME_RE.test(d.id)) {
      add({
        severity: 'error',
        code: 'structure.variable.invalid-id',
        params: { id: d.id, index: i },
        variableId: d.id,
      })
    } else if (varSeen.has(d.id)) {
      add({
        severity: 'error',
        code: 'structure.variable.duplicate-id',
        params: { id: d.id, index: i },
        variableId: d.id,
      })
    } else {
      varSeen.add(d.id)
    }
  }

  for (const s of doc.states) {
    if (s.parent === null) continue
    if (s.parent === s.uid) {
      add({
        severity: 'error',
        code: 'structure.state.self-parent',
        params: { id: s.id, uid: s.uid },
        stateId: s.id,
        stateUid: s.uid,
      })
    } else if (!byUid.has(s.parent)) {
      add({
        severity: 'error',
        code: 'structure.state.missing-parent',
        params: { id: s.id, parent: s.parent },
        stateId: s.id,
        stateUid: s.uid,
      })
    }
  }

  // 父子环检测（DFS 三色）。环上每个状态只报一次。
  const color = new Map<string, 0 | 1 | 2>()
  const reportedCycle = new Set<string>()
  const visit = (uid: string): void => {
    color.set(uid, 1)
    const s = byUid.get(uid)
    const parent = s?.parent
    if (parent && byUid.has(parent)) {
      const pc = color.get(parent) ?? 0
      if (pc === 1) {
        if (!reportedCycle.has(uid)) {
          reportedCycle.add(uid)
          add({
            severity: 'error',
            code: 'structure.state.parent-cycle',
            params: { id: s!.id, parent },
            stateId: s!.id,
            stateUid: uid,
          })
        }
      } else if (pc === 0) {
        visit(parent)
      }
    }
    color.set(uid, 2)
  }
  for (const s of doc.states) {
    if (s.uid && byUid.has(s.uid) && (color.get(s.uid) ?? 0) === 0) visit(s.uid)
  }

  const directChildren = (uid: string): StateNode[] => doc.states.filter((s) => s.parent === uid)

  for (const s of doc.states) {
    const kids = directChildren(s.uid)
    if (isHistory(s)) {
      if (s.parent === null) {
        add({
          severity: 'error',
          code: 'structure.state.history-root',
          params: { id: s.id },
          stateId: s.id,
          stateUid: s.uid,
        })
      }
      if (kids.length) {
        add({
          severity: 'error',
          code: 'structure.state.history-children',
          params: { id: s.id, count: kids.length },
          stateId: s.id,
          stateUid: s.uid,
        })
      }
      if (s.entryActions.length || s.exitActions.length) {
        add({
          severity: 'warning',
          code: 'structure.state.history-actions',
          params: { id: s.id },
          stateId: s.id,
          stateUid: s.uid,
        })
      }
      if (s.doneData) {
        add({
          severity: 'error',
          code: 'structure.state.donedata-not-final',
          params: { id: s.id, kind: s.kind },
          stateId: s.id,
          stateUid: s.uid,
        })
      }
      continue
    }
    if (s.kind === 'final' && kids.length) {
      add({
        severity: 'error',
        code: 'structure.state.final-children',
        params: { id: s.id, count: kids.length },
        stateId: s.id,
        stateUid: s.uid,
      })
    }
    if (s.kind === 'final') {
      const outs = doc.transitions.filter((t) => t.source === s.uid)
      if (outs.length) {
        add({
          severity: 'error',
          code: 'structure.state.final-transition',
          params: { id: s.id, count: outs.length },
          stateId: s.id,
          stateUid: s.uid,
        })
      }
    }
    if (s.doneData) {
      if (s.kind !== 'final') {
        add({
          severity: 'error',
          code: 'structure.state.donedata-not-final',
          params: { id: s.id, kind: s.kind },
          stateId: s.id,
          stateUid: s.uid,
        })
      }
      const hasParams = !!s.doneData.params?.length
      const hasExpr = s.doneData.expr !== undefined
      const hasContent = s.doneData.content !== undefined
      const forms = (hasParams ? 1 : 0) + (hasExpr ? 1 : 0) + (hasContent ? 1 : 0)
      if (forms === 0 || (hasExpr && !s.doneData.expr?.trim()) || (hasContent && !s.doneData.content?.trim())) {
        add({
          severity: 'error',
          code: 'structure.state.donedata-empty',
          params: { id: s.id },
          stateId: s.id,
          stateUid: s.uid,
        })
      }
      if (forms > 1) {
        add({
          severity: 'error',
          code: 'structure.state.donedata-ambiguous',
          params: { id: s.id, forms },
          stateId: s.id,
          stateUid: s.uid,
        })
      }
      const paramNames = new Set<string>()
      for (let i = 0; i < (s.doneData.params?.length ?? 0); i++) {
        const p = s.doneData.params![i]!
        const name = p.name?.trim() ?? ''
        if (!name || !NCNAME_RE.test(name) || typeof p.expr !== 'string' || !p.expr.trim()) {
          add({
            severity: 'error',
            code: 'structure.state.donedata-param-invalid',
            params: { id: s.id, index: i },
            stateId: s.id,
            stateUid: s.uid,
          })
        }
        if (name) {
          if (paramNames.has(name)) {
            add({
              severity: 'error',
              code: 'structure.state.donedata-param-duplicate',
              params: { id: s.id, name, index: i },
              stateId: s.id,
              stateUid: s.uid,
            })
          }
          paramNames.add(name)
        }
      }
    }
    if (s.kind === 'atomic' && kids.length) {
      add({
        severity: 'error',
        code: 'structure.state.atomic-children',
        params: { id: s.id, count: kids.length },
        stateId: s.id,
        stateUid: s.uid,
      })
    }
    if (s.kind === 'compound' && !kids.length) {
      add({
        severity: 'warning',
        code: 'structure.state.compound-empty',
        params: { id: s.id },
        stateId: s.id,
        stateUid: s.uid,
      })
    }
    if (s.kind === 'parallel' && s.initial) {
      add({
        severity: 'warning',
        code: 'structure.state.parallel-initial',
        params: { id: s.id },
        stateId: s.id,
        stateUid: s.uid,
      })
    }
    if (s.kind !== 'compound' && s.initial) {
      add({
        severity: 'warning',
        code: 'structure.state.initial-ignored',
        params: { id: s.id, kind: s.kind },
        stateId: s.id,
        stateUid: s.uid,
      })
    }
    if (s.kind === 'compound') {
      if (!s.initial) {
        if (kids.length) {
          add({
            severity: 'warning',
            code: 'structure.state.initial-fallback',
            params: { id: s.id },
            stateId: s.id,
            stateUid: s.uid,
          })
        }
      } else {
        const ini = byUid.get(s.initial)
        if (!ini) {
          add({
            severity: 'error',
            code: 'structure.state.initial-missing',
            params: { id: s.id, initial: s.initial },
            stateId: s.id,
            stateUid: s.uid,
          })
        } else if (ini.parent !== s.uid) {
          add({
            severity: 'error',
            code: 'structure.state.initial-not-child',
            params: { id: s.id, initial: ini.id },
            stateId: s.id,
            stateUid: s.uid,
          })
        } else if (isHistory(ini)) {
          add({
            severity: 'warning',
            code: 'structure.state.initial-history',
            params: { id: s.id, initial: ini.id },
            stateId: s.id,
            stateUid: s.uid,
          })
        }
      }
    }
  }

  if (doc.initial) {
    const ini = byUid.get(doc.initial)
    if (!ini) {
      add({
        severity: 'error',
        code: 'structure.root.initial-missing',
        params: { initial: doc.initial },
      })
    } else if (ini.parent !== null) {
      add({
        severity: 'error',
        code: 'structure.root.initial-not-top',
        params: { initial: ini.id },
        stateId: ini.id,
        stateUid: ini.uid,
      })
    }
  }

  const transitionSeen = new Set<string>()
  for (const t of doc.transitions) {
    if (!t.id) {
      add({
        severity: 'warning',
        code: 'structure.transition.missing-id',
        params: { event: t.event },
      })
    } else if (transitionSeen.has(t.id)) {
      add({
        severity: 'warning',
        code: 'structure.transition.duplicate-id',
        params: { id: t.id },
        transitionId: t.id,
      })
    } else {
      transitionSeen.add(t.id)
    }
    if (!byUid.has(t.source)) {
      add({
        severity: 'error',
        code: 'structure.transition.missing-source',
        params: { id: t.id, source: t.source, event: t.event },
        transitionId: t.id,
      })
    }
    if (t.target !== null && !byUid.has(t.target)) {
      add({
        severity: 'error',
        code: 'structure.transition.missing-target',
        params: { id: t.id, target: t.target, event: t.event },
        transitionId: t.id,
      })
    }
    if (t.target === null) {
      if (byUid.get(t.source)?.kind === 'history') {
        add({
          severity: 'error',
          code: 'structure.transition.history-targetless',
          params: { id: t.id },
          transitionId: t.id,
        })
      }
      if (!t.event && t.delayMs === undefined) {
        add({
          severity: 'warning',
          code: 'structure.transition.internal-eventless',
          params: { id: t.id },
          transitionId: t.id,
        })
      }
    }
    if (t.delayMs !== undefined) {
      if (!Number.isFinite(t.delayMs) || t.delayMs < 10) {
        add({
          severity: 'error',
          code: 'structure.transition.delay-invalid',
          params: { id: t.id, delayMs: t.delayMs, event: t.event },
          transitionId: t.id,
        })
      }
      if (!t.event) {
        add({
          severity: 'error',
          code: 'structure.transition.delay-without-event',
          params: { id: t.id, delayMs: t.delayMs },
          transitionId: t.id,
        })
      }
    }
  }

  return { ok: !issues.some((i) => i.severity === 'error'), issues }
}
