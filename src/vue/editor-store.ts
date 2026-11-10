/**
 * 编辑器状态与动作（P3）。
 *
 * 不依赖 Pinia：一个 `reactive` 状态 + 方法对象，`mountEditor` 通过 provide 注入。
 * 所有宿主能力（持久化/导入导出/外部事件/部署/退出）走 `EditorAdapter`；
 * 文档模型、命名、校验、序列化、会话仍来自 kit core/engine。
 */
import { markRaw, reactive } from 'vue'
import { BASE_POLICY, type NamingPolicy } from '../core/naming-policy'
import type { ExternalEventSource } from '../core/event-catalog'
import {
  autoDelayEventName,
  childrenOf,
  descendantsOf,
  emptyDoc,
  newTransitionId,
  newUid,
  normalizeDoc,
  syncUidSeq,
  uidMap,
  uniqueStateId,
  type DataVar,
  type ProjectDoc,
  type StateKind,
  type StateNode,
  type TransitionEdge,
} from '../core/model'
import { NCNAME_RE } from '../core/validate-structure'
import { serializeToScxml } from '../core/serializer'
import { checkEventName, checkVarName } from '../core/naming'
import { scanScriptActions } from '../core/action-parse'
import { scriptHitsToIssues, validateDocument, type ValidationIssue } from '../engine/validator'
import { SessionRunner, type SimLogEntry, type VariableWriteResult } from '../engine/session-runner'
import { DEFAULT_LABELS, type EditorLabels } from './labels'
import { resolveFeatures, type EditorFeatures } from './features'
import { buildEditorEventOptions, type EditorEventOption } from './events'
import { formatNamingIssue, formatValidationIssue, formatVariableResult } from './format'
import { createBrowserAdapter } from './browser-adapter'
import type { EditorAdapter } from './types'
import type {
  EditorEventSourceProvider,
  EditorModule,
  EditorModuleContext,
  EditorModuleIssue,
  EditorTabContribution,
  EditorToolbarContribution,
  EditorValidator,
} from './modules'
import type { DOMParserLike } from '@tinyactors/scxmljs/trusted'

export type SelectionKind = 'state' | 'transition' | null

export interface EditorConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  tone: 'danger' | 'primary'
  resolve: (ok: boolean) => void
}

export interface ValidationDialogState {
  title: string
  issues: ValidationIssue[]
  source?: string
}

export interface EditorSimState {
  running: boolean
  paused: boolean
  speed: number
  activeIds: string[]
  log: SimLogEntry[]
  variables: Record<string, unknown> | null
}

export interface EditorState {
  doc: ProjectDoc
  selection: { kind: SelectionKind; id: string | null }
  sim: EditorSimState
  validation: { ok: boolean; issues: ValidationIssue[] } | null
  validationDialog: ValidationDialogState | null
  undoStack: ProjectDoc[]
  redoStack: ProjectDoc[]
  externalEvents: ExternalEventSource[]
  dirty: boolean
  saving: boolean
  deploying: boolean
  confirm: EditorConfirmRequest | null
  revision: number
  /** 校验弹窗「定位」：滚动并 flash 对应动作行 */
  actionFocus: { uid: string; slot: 'entry' | 'exit' | 'transition'; index: number; nonce: number } | null
  /** 模块贡献（P4）；组件用 markRaw 避免被 Vue 代理 */
  moduleTabs: EditorTabContribution[]
  moduleToolbar: EditorToolbarContribution[]
  moduleEventSources: EditorEventSourceProvider[]
  moduleValidators: EditorValidator[]
}

export interface CreateEditorOptions {
  initialDoc?: ProjectDoc
  adapter?: EditorAdapter
  features?: Partial<EditorFeatures>
  policy?: NamingPolicy
  labels?: Partial<EditorLabels>
  /** Node 环境的 DOMParser（浏览器可省略；优先于 adapter.domParser） */
  domParser?: DOMParserLike
  /** false = 不从 adapter.load 读取（默认 true） */
  autoLoad?: boolean
  /** 上层功能模块（全局变量/路由/MQTT/部署…），由宿主注入 */
  modules?: EditorModule[]
}

const UNDO_LIMIT = 50
const UNDO_COALESCE_MS = 800
const LOG_LIMIT = 300
const SAVE_DEBOUNCE_MS = 400
const BUILTIN_TAB_IDS = new Set(['props', 'vars', 'sim'])

/** ProjectDoc 是纯 JSON 数据；JSON 克隆同时避开 Vue reactive Proxy（structuredClone 不能克隆 Proxy） */
function cloneDoc(doc: ProjectDoc): ProjectDoc {
  return JSON.parse(JSON.stringify(doc)) as ProjectDoc
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 合并同 value 的外部事件来源：tag 去重排序、tip 换行合并 */
function mergeExternalEventSources(items: ExternalEventSource[]): ExternalEventSource[] {
  const map = new Map<string, { tags: Set<string>; tips: Set<string> }>()
  for (const item of items) {
    if (!item.value) continue
    const cur = map.get(item.value) ?? { tags: new Set<string>(), tips: new Set<string>() }
    if (item.tag) cur.tags.add(item.tag)
    if (item.tip) cur.tips.add(item.tip)
    map.set(item.value, cur)
  }
  return [...map]
    .map(([value, { tags, tips }]) => ({
      value,
      ...(tags.size ? { tag: [...tags].sort().join(' · ') } : {}),
      ...(tips.size ? { tip: [...tips].join('\n') } : {}),
    }))
    .sort((a, b) => a.value.localeCompare(b.value))
}

/** 模块 issue → kit ValidationIssue（kind=module，宿主可本地化 code） */
function toValidationIssue(issue: EditorModuleIssue): ValidationIssue {
  return {
    code: issue.code,
    params: issue.params ?? {},
    severity: issue.severity ?? 'error',
    kind: 'module',
    ...(issue.stateId !== undefined ? { stateId: issue.stateId } : {}),
    ...(issue.event !== undefined ? { event: issue.event } : {}),
    ...(issue.transitionId !== undefined ? { transitionId: issue.transitionId } : {}),
    ...(issue.actionIndex !== undefined ? { actionIndex: issue.actionIndex } : {}),
  }
}

export interface EditorStore {
  readonly state: EditorState
  readonly labels: EditorLabels
  readonly features: EditorFeatures
  readonly policy: NamingPolicy
  readonly adapter: EditorAdapter
  readonly runner: SessionRunner
  ready: Promise<void>

  get doc(): ProjectDoc
  get selection(): EditorState['selection']
  get sim(): EditorSimState
  get dirty(): boolean
  get saving(): boolean
  get deploying(): boolean
  get readOnly(): boolean
  get locked(): boolean
  get validation(): EditorState['validation']
  get validationDialog(): ValidationDialogState | null
  get confirmRequest(): EditorConfirmRequest | null
  get selectedState(): StateNode | null
  get selectedTransition(): TransitionEdge | null
  get canUndo(): boolean
  get canRedo(): boolean
  get topStates(): StateNode[]
  get knownEvents(): string[]
  get activeLabels(): string[]
  get canDeploy(): boolean
  get moduleTabs(): readonly EditorTabContribution[]
  get moduleToolbar(): readonly EditorToolbarContribution[]
  focusFor(uid: string, slot: 'entry' | 'exit' | 'transition'): number | null
  locateIssue(issue: ValidationIssue): void

  eventOptions(): EditorEventOption[]
  stateName(uid: string): string
  validateEventName(name: string, transitionId?: string): string | null
  checkVarId(index: number, id: string): string | null

  init(): Promise<void>
  loadDoc(doc: ProjectDoc, opts?: { persist?: boolean; history?: boolean }): Promise<void>
  newDoc(): Promise<void>
  openProject(): Promise<void>
  saveProject(): Promise<void>
  exportScxml(): Promise<void>
  refreshExternalEvents(): Promise<void>
  registerModule(module: EditorModule): void

  captureUndo(tag: string): void
  touch(): void
  markDirty(): void
  scheduleSave(): void
  saveNow(): Promise<void>
  undo(): void
  redo(): void

  addState(kind: StateKind, parentUid?: string | null): void
  updateState(uid: string, patch: Partial<StateNode>): string | null
  removeState(uid: string): boolean
  setParent(childUid: string, parentUid: string | null): void
  addTransition(sourceUid: string, targetUid: string, opts?: { event?: string; delayMs?: number; delayUnit?: 's' | 'ms' }): string | null
  updateTransition(id: string, patch: Partial<TransitionEdge>): void
  removeTransition(id: string): void
  addVariable(): void
  updateVariable(index: number, patch: Partial<DataVar>): string | null
  removeVariable(index: number): void
  setDocMeta(patch: { name?: string; initial?: string | null }): void
  select(kind: SelectionKind, id: string | null): void
  deleteState(uid: string): Promise<boolean>
  deleteTransition(id: string): Promise<boolean>
  deleteSelection(): Promise<void>

  validate(): Promise<boolean>
  run(): Promise<boolean>
  stopSim(): Promise<void>
  togglePause(): void
  stepSim(): void
  setSpeed(n: number): void
  sendEvent(name: string, data?: unknown): void
  assignVariable(id: string, expr: string): VariableWriteResult
  refreshVariables(): void

  confirm(opts: { title: string; message: string; confirmLabel?: string; tone?: 'danger' | 'primary' }): Promise<boolean>
  respondConfirm(ok: boolean): void
  openValidationDialog(title: string, issues: ValidationIssue[], source?: string): void
  closeValidationDialog(): void
  pushLog(kind: SimLogEntry['kind'], text: string, level?: 'info' | 'warn' | 'error'): void
  clearLog(): void
  deploy(): Promise<void>
  exit(): void
  destroy(): Promise<void>
}

export function createEditor(options: CreateEditorOptions = {}): EditorStore {
  const adapter = options.adapter ?? createBrowserAdapter({ policy: options.policy })
  const policy = options.policy ?? adapter.policy ?? BASE_POLICY
  const labels: EditorLabels = { ...DEFAULT_LABELS, ...(options.labels ?? {}) }
  const features = resolveFeatures(options.features)
  const domParser = options.domParser ?? adapter.domParser
  const runner = new SessionRunner({
    ...(adapter.runner ?? {}),
    ...(domParser ? { domParser } : {}),
  })

  const state = reactive<EditorState>({
    doc: emptyDoc('untitled'),
    selection: { kind: null, id: null },
    sim: { running: false, paused: false, speed: 1, activeIds: [], log: [], variables: null },
    validation: null,
    validationDialog: null,
    undoStack: [],
    redoStack: [],
    externalEvents: [],
    dirty: false,
    saving: false,
    deploying: false,
    confirm: null,
    revision: 0,
    actionFocus: null,
    moduleTabs: [],
    moduleToolbar: [],
    moduleEventSources: [],
    moduleValidators: [],
  })

  let pendingUndo: { doc: ProjectDoc; tag: string } | null = null
  let lastUndoTag = ''
  let lastUndoTime = 0
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let saveChain: Promise<void> = Promise.resolve()
  let offRunner: (() => void) | null = null
  let actionFocusTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false
  const moduleDisposers: (() => void)[] = []

  const readOnly = (): boolean =>
    typeof adapter.readOnly === 'function' ? adapter.readOnly() : adapter.readOnly === true

  function setDirty(dirty: boolean): void {
    if (state.dirty === dirty) return
    state.dirty = dirty
    adapter.onDirtyChange?.(dirty)
  }

  function pushLog(
    kind: SimLogEntry['kind'],
    text: string,
    level: 'info' | 'warn' | 'error' = kind === 'error' ? 'error' : 'info',
  ): void {
    const entry: SimLogEntry = { time: Date.now(), kind, text, level, source: 'ui' }
    state.sim.log.push(entry)
    if (state.sim.log.length > LOG_LIMIT) state.sim.log.splice(0, state.sim.log.length - LOG_LIMIT)
    adapter.onLog?.({ time: entry.time, level, text })
  }

  function select(kind: SelectionKind, id: string | null): void {
    state.selection = { kind, id }
  }

  function stateName(uid: string): string {
    const s = state.doc.states.find((x) => x.uid === uid)
    return s ? s.label || s.id : uid
  }

  function captureUndo(tag: string): void {
    if (readOnly() || state.sim.running) return
    pendingUndo = { doc: cloneDoc(state.doc), tag }
  }

  function commitUndo(): void {
    if (!pendingUndo) return
    const now = Date.now()
    const coalesce = pendingUndo.tag === lastUndoTag && now - lastUndoTime < UNDO_COALESCE_MS
    if (!coalesce) {
      state.undoStack.push(pendingUndo.doc)
      if (state.undoStack.length > UNDO_LIMIT) state.undoStack.shift()
    }
    state.redoStack = []
    lastUndoTag = pendingUndo.tag
    lastUndoTime = now
    pendingUndo = null
  }

  function markDirty(): void {
    state.revision++
    setDirty(true)
    adapter.onDocChange?.(state.doc)
    scheduleSave()
  }

  function touch(): void {
    commitUndo()
    markDirty()
  }

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    if (!adapter.save) return
    saveTimer = setTimeout(() => {
      void saveNow()
    }, SAVE_DEBOUNCE_MS)
  }

  async function saveNow(): Promise<void> {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (!adapter.save || readOnly()) return
    const rev = state.revision
    const doc = state.doc
    state.saving = true
    // 串行化保存，避免慢宿主下旧快照覆盖新快照
    saveChain = saveChain.then(async () => {
      try {
        await adapter.save?.(doc)
        if (rev === state.revision) setDirty(false)
      } catch (err) {
        pushLog('error', `自动保存失败：${errorMessage(err)}`)
      } finally {
        state.saving = false
      }
    })
    await saveChain
  }

  async function refreshExternalEvents(): Promise<void> {
    const sources: ExternalEventSource[] = []
    if (adapter.externalEvents) {
      try {
        sources.push(...(await adapter.externalEvents()))
      } catch (err) {
        pushLog('system', `读取外部事件来源失败：${errorMessage(err)}`, 'warn')
      }
    }
    for (const provider of [...state.moduleEventSources]) {
      try {
        sources.push(...(await provider.provide(editor)))
      } catch (err) {
        pushLog('system', `模块事件来源 ${provider.id} 读取失败：${errorMessage(err)}`, 'warn')
      }
    }
    state.externalEvents = mergeExternalEventSources(sources)
  }

  /** 注册上层功能模块（setup 抛错隔离，不影响编辑器） */
  function registerModule(module: EditorModule): void {
    const localDisposers: (() => void)[] = []
    const disposeAll = (): void => {
      for (const fn of [...localDisposers].reverse()) {
        try {
          fn()
        } catch {
          /* 模块清理失败不影响编辑器 */
        }
      }
      localDisposers.length = 0
    }
    const ctx: EditorModuleContext = {
      editor,
      tabs: {
        add(contribution) {
          if (BUILTIN_TAB_IDS.has(contribution.id)) {
            throw new Error(`模块标签页 id 与内置页冲突：${contribution.id}`)
          }
          if (state.moduleTabs.some((t) => t.id === contribution.id)) {
            throw new Error(`模块标签页 id 重复：${contribution.id}`)
          }
          state.moduleTabs.push({ ...contribution, component: markRaw(contribution.component) })
          state.moduleTabs.sort(
            (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title),
          )
          const remove = (): void => {
            const i = state.moduleTabs.findIndex((t) => t.id === contribution.id)
            if (i >= 0) state.moduleTabs.splice(i, 1)
          }
          localDisposers.push(remove)
          return remove
        },
        remove(id) {
          const i = state.moduleTabs.findIndex((t) => t.id === id)
          if (i >= 0) state.moduleTabs.splice(i, 1)
        },
      },
      toolbar: {
        add(contribution) {
          if (state.moduleToolbar.some((t) => t.id === contribution.id)) {
            throw new Error(`模块工具栏 id 重复：${contribution.id}`)
          }
          state.moduleToolbar.push({ ...contribution })
          state.moduleToolbar.sort(
            (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.label.localeCompare(b.label),
          )
          const remove = (): void => {
            const i = state.moduleToolbar.findIndex((t) => t.id === contribution.id)
            if (i >= 0) state.moduleToolbar.splice(i, 1)
          }
          localDisposers.push(remove)
          return remove
        },
        remove(id) {
          const i = state.moduleToolbar.findIndex((t) => t.id === id)
          if (i >= 0) state.moduleToolbar.splice(i, 1)
        },
      },
      eventSources: {
        add(provider) {
          if (state.moduleEventSources.some((p) => p.id === provider.id)) {
            throw new Error(`模块事件来源 id 重复：${provider.id}`)
          }
          state.moduleEventSources.push(provider)
          const remove = (): void => {
            const i = state.moduleEventSources.findIndex((p) => p.id === provider.id)
            if (i >= 0) state.moduleEventSources.splice(i, 1)
          }
          localDisposers.push(remove)
          return remove
        },
        remove(id) {
          const i = state.moduleEventSources.findIndex((p) => p.id === id)
          if (i >= 0) state.moduleEventSources.splice(i, 1)
        },
        refresh: refreshExternalEvents,
      },
      validators: {
        add(validator) {
          state.moduleValidators.push(validator)
          const remove = (): void => {
            const i = state.moduleValidators.indexOf(validator)
            if (i >= 0) state.moduleValidators.splice(i, 1)
          }
          localDisposers.push(remove)
          return remove
        },
        clear() {
          state.moduleValidators.splice(0, state.moduleValidators.length)
        },
      },
      onDispose(fn) {
        localDisposers.push(fn)
      },
    }

    try {
      const cleanup = module.setup(ctx)
      if (cleanup) localDisposers.push(cleanup)
    } catch (err) {
      disposeAll()
      pushLog('error', `模块「${module.id}」加载失败：${errorMessage(err)}`)
      return
    }
    moduleDisposers.push(disposeAll)
  }

  function pruneSelection(): void {
    const { kind, id } = state.selection
    if (!id) return
    const exists =
      kind === 'state'
        ? state.doc.states.some((s) => s.uid === id)
        : kind === 'transition'
          ? state.doc.transitions.some((t) => t.id === id)
          : true
    if (!exists) select(null, null)
  }

  function undo(): void {
    if (!editor.canUndo) return
    const doc = state.undoStack.pop()!
    state.redoStack.push(cloneDoc(state.doc))
    state.doc = doc
    pruneSelection()
    markDirty()
  }

  function redo(): void {
    if (!editor.canRedo) return
    const doc = state.redoStack.pop()!
    state.undoStack.push(cloneDoc(state.doc))
    state.doc = doc
    pruneSelection()
    markDirty()
  }

  async function loadDoc(doc: ProjectDoc, opts: { persist?: boolean; history?: boolean } = {}): Promise<void> {
    if (state.sim.running) await stopSim()
    pendingUndo = null
    lastUndoTag = ''
    if (opts.history !== false) {
      state.undoStack = []
      state.redoStack = []
    }
    state.doc = normalizeDoc(cloneDoc(doc))
    state.selection = { kind: null, id: null }
    state.validation = null
    state.validationDialog = null
    state.revision++
    adapter.onDocChange?.(state.doc)
    if (opts.persist === false) setDirty(false)
    else {
      setDirty(true)
      scheduleSave()
    }
  }

  async function newDoc(): Promise<void> {
    await loadDoc(emptyDoc('untitled'))
  }

  async function openProject(): Promise<void> {
    if (!adapter.importProject) {
      pushLog('system', '当前宿主未提供“打开”能力', 'warn')
      return
    }
    try {
      const result = await adapter.importProject()
      await loadDoc(result.doc)
      pushLog(
        'lifecycle',
        result.source === 'scxml'
          ? `已导入 SCXML「${result.doc.name}」`
          : `已打开工程「${result.doc.name}」`,
      )
      for (const w of result.warnings ?? []) pushLog('lifecycle', `导入提示：${w}`, 'warn')
    } catch (err) {
      pushLog('error', `打开工程失败：${errorMessage(err)}`)
    }
  }

  async function saveProject(): Promise<void> {
    await saveNow()
    try {
      if (adapter.exportProject) {
        await adapter.exportProject(state.doc)
        setDirty(false)
      } else if (!adapter.save) {
        pushLog('system', '当前宿主未提供保存能力', 'warn')
      }
    } catch (err) {
      pushLog('error', `保存失败：${errorMessage(err)}`)
    }
  }

  async function exportScxml(): Promise<void> {
    const xml = serializeToScxml(state.doc)
    if (adapter.exportScxml) {
      try {
        await adapter.exportScxml(xml, state.doc)
      } catch (err) {
        pushLog('error', `导出 SCXML 失败：${errorMessage(err)}`)
      }
      return
    }
    if (typeof document !== 'undefined') {
      const blob = new Blob([xml], { type: 'application/scxml+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${state.doc.name || 'chart'}.scxml`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  function setDocMeta(patch: { name?: string; initial?: string | null }): void {
    if (readOnly() || state.sim.running) return
    captureUndo(`docMeta:${Object.keys(patch).join(',')}`)
    Object.assign(state.doc, patch)
    touch()
  }

  function addState(kind: StateKind, parentUid?: string | null): void {
    if (readOnly() || state.sim.running) return
    const sel = editor.selectedState
    let parent: string | null
    if (parentUid !== undefined) parent = parentUid
    else if (kind === 'history') {
      parent = sel && (sel.kind === 'compound' || sel.kind === 'parallel') ? sel.uid : null
    } else parent = sel && sel.kind === 'compound' ? sel.uid : null

    const p = parent ? state.doc.states.find((x) => x.uid === parent) : null
    if (kind === 'history' && !p) {
      pushLog('error', '历史伪态必须添加到组合/并行状态内部')
      return
    }
    if (p) {
      if (p.kind === 'parallel' && kind !== 'compound' && kind !== 'history') {
        pushLog('error', '并行状态的子状态只能是组合状态（区域）或历史伪态')
        return
      }
      if (p.kind === 'history' || p.kind === 'final' || p.kind === 'atomic') {
        pushLog('error', '原子/终态/历史伪态不能包含子状态')
        return
      }
    }
    syncUidSeq(state.doc)
    const base = kind === 'final' ? 'done' : kind === 'history' ? 'hist' : kind === 'parallel' ? 'cluster' : 'state'
    const defaultLabel =
      kind === 'compound'
        ? p?.kind === 'parallel'
          ? '区域'
          : '组合状态'
        : kind === 'final'
          ? '终态'
          : kind === 'parallel'
            ? '并行状态'
            : kind === 'history'
              ? '历史'
              : '新状态'
    const s: StateNode = {
      uid: newUid(),
      id: uniqueStateId(state.doc, base),
      label: defaultLabel,
      kind,
      parent,
      initial: null,
      historyType: kind === 'history' ? 'shallow' : undefined,
      entryActions: [],
      exitActions: [],
    }
    captureUndo('addState')
    state.doc.states.push(s)
    touch()
    select('state', s.uid)
  }

  function updateState(uid: string, patch: Partial<StateNode>): string | null {
    if (readOnly() || state.sim.running) return '当前为只读/仿真中'
    const s = state.doc.states.find((x) => x.uid === uid)
    if (!s) return '状态不存在'
    if (patch.id !== undefined && patch.id !== s.id) {
      const id = patch.id.trim()
      if (!NCNAME_RE.test(id)) return 'id 非法：须以字母/下划线开头'
      if (state.doc.states.some((x) => x.uid !== uid && x.id === id)) return 'id 已被其他状态使用'
      patch = { ...patch, id }
    }
    if (patch.kind && patch.kind !== s.kind) {
      const kids = childrenOf(state.doc, uid)
      if (
        (patch.kind === 'atomic' || patch.kind === 'final' || patch.kind === 'history') &&
        kids.length
      ) {
        return '存在子状态，不能改为原子/终态/历史伪态'
      }
      if (patch.kind === 'parallel' && kids.some((k) => k.kind !== 'compound')) {
        return '并行状态的子状态必须全部是组合状态（区域）'
      }
      if (patch.kind === 'history') {
        if (!s.parent) return '历史伪态必须有父状态'
        const p = state.doc.states.find((x) => x.uid === s.parent)
        if (p && p.kind !== 'compound' && p.kind !== 'parallel') {
          return '历史伪态的父状态必须是组合或并行状态'
        }
      }
    }
    if (patch.historyType !== undefined && (patch.kind ?? s.kind) !== 'history') {
      patch = { ...patch }
      delete patch.historyType
    }
    captureUndo(`updateState:${uid}`)
    const idChanged = patch.id !== undefined && patch.id !== s.id
    Object.assign(s, patch)
    if (idChanged) {
      for (const t of state.doc.transitions) {
        if (t.delayMs === undefined) continue
        if (t.source !== s.uid && t.target !== s.uid) continue
        const srcId = state.doc.states.find((x) => x.uid === t.source)?.id ?? t.source
        const dstId = state.doc.states.find((x) => x.uid === t.target)?.id ?? t.target
        t.event = autoDelayEventName(state.doc, srcId, dstId, t.delayMs, t.delayUnit)
      }
    }
    touch()
    return null
  }

  function removeState(uid: string): boolean {
    if (readOnly() || state.sim.running) return false
    if (!state.doc.states.some((s) => s.uid === uid)) return false
    captureUndo(`removeState:${uid}`)
    const doomed = descendantsOf(state.doc, uid)
    doomed.add(uid)
    state.doc.states = state.doc.states.filter((s) => !doomed.has(s.uid))
    state.doc.transitions = state.doc.transitions.filter(
      (t) => !doomed.has(t.source) && !doomed.has(t.target),
    )
    for (const s of state.doc.states) {
      if (s.initial && doomed.has(s.initial)) s.initial = null
    }
    if (state.doc.initial && doomed.has(state.doc.initial)) {
      state.doc.initial = editor.topStates[0]?.uid ?? null
    }
    if (state.selection.id && doomed.has(state.selection.id)) select(null, null)
    touch()
    return true
  }

  function setParent(childUid: string, parentUid: string | null): void {
    if (readOnly() || state.sim.running) return
    const child = state.doc.states.find((s) => s.uid === childUid)
    if (!child || parentUid === childUid) return
    if (child.kind === 'history' && !parentUid) return
    if (parentUid) {
      const parent = state.doc.states.find((s) => s.uid === parentUid)
      if (!parent) return
      if (parent.kind !== 'compound' && parent.kind !== 'parallel') return
      if (parent.kind === 'parallel' && child.kind !== 'compound' && child.kind !== 'history') return
      if (descendantsOf(state.doc, childUid).has(parentUid)) return
    }
    const oldParent = child.parent
    captureUndo(`setParent:${childUid}`)
    child.parent = parentUid
    if (oldParent) {
      const op = state.doc.states.find((s) => s.uid === oldParent)
      if (op && op.initial === childUid) op.initial = null
    }
    touch()
  }

  function validateEventName(name: string, transitionId?: string): string | null {
    const issue = checkEventName(policy, name, { doc: state.doc })
    if (issue?.level === 'block') return formatNamingIssue(issue)
    if (transitionId && state.doc.transitions.some((t) => t.id !== transitionId && t.event === name)) {
      // 同名事件允许多条转移；这里只做提示，不阻断
    }
    return null
  }

  function addTransition(
    sourceUid: string,
    targetUid: string,
    opts: { event?: string; delayMs?: number; delayUnit?: 's' | 'ms' } = {},
  ): string | null {
    if (readOnly() || state.sim.running) return '当前为只读/仿真中'
    if (!state.doc.states.some((s) => s.uid === sourceUid)) return '源状态不存在'
    if (!state.doc.states.some((s) => s.uid === targetUid)) return '目标状态不存在'
    const src = state.doc.states.find((s) => s.uid === sourceUid)
    const tgt = state.doc.states.find((s) => s.uid === targetUid)
    if ((src?.kind === 'history' || tgt?.kind === 'history') && sourceUid === targetUid) {
      return '历史伪态不能以自身为源/目标'
    }
    if (src?.kind === 'history' && state.doc.transitions.some((t) => t.source === sourceUid)) {
      return '历史伪态只能有一条默认转移'
    }
    if (src?.kind === 'history' && opts.delayMs !== undefined) {
      return '历史伪态的默认转移不能使用内部延迟'
    }
    let event = opts.event?.trim() ?? ''
    // 历史伪态的出边是默认转移：不带事件/条件
    if (src?.kind === 'history') event = ''
    if (opts.delayMs !== undefined) {
      if (!Number.isFinite(opts.delayMs) || opts.delayMs < 10) return '延时需 ≥ 10ms'
      event = autoDelayEventName(
        state.doc,
        src?.id ?? sourceUid,
        tgt?.id ?? targetUid,
        opts.delayMs,
        opts.delayUnit ?? 's',
      )
    } else if (event) {
      const err = validateEventName(event)
      if (err) return err
    }
    const t: TransitionEdge = {
      id: newTransitionId(),
      source: sourceUid,
      target: targetUid,
      event,
      cond: '',
      actions: [],
      ...(opts.delayMs !== undefined ? { delayMs: opts.delayMs, delayUnit: opts.delayUnit ?? 's' } : {}),
    }
    captureUndo(`addTransition:${sourceUid}->${targetUid}`)
    state.doc.transitions.push(t)
    touch()
    select('transition', t.id)
    return null
  }

  function updateTransition(id: string, patch: Partial<TransitionEdge>): void {
    if (readOnly() || state.sim.running) return
    const t = state.doc.transitions.find((x) => x.id === id)
    if (!t) return
    const src = state.doc.states.find((s) => s.uid === t.source)
    if (src?.kind === 'history') {
      patch = { ...patch }
      if ('event' in patch) patch.event = ''
      if ('cond' in patch) patch.cond = ''
      if ('delayMs' in patch) delete patch.delayMs
    }
    captureUndo(`updateTransition:${id}`)
    Object.assign(t, patch)
    if (t.delayMs !== undefined) {
      const srcId = state.doc.states.find((x) => x.uid === t.source)?.id ?? t.source
      const dstId = state.doc.states.find((x) => x.uid === t.target)?.id ?? t.target
      t.event = autoDelayEventName(state.doc, srcId, dstId, t.delayMs, t.delayUnit, t.event)
    } else if (!t.event) {
      // 取消延时后保留用户之前填的事件（若有）；无事件转移合法
    }
    touch()
  }

  function removeTransition(id: string): void {
    if (readOnly() || state.sim.running) return
    captureUndo(`removeTransition:${id}`)
    state.doc.transitions = state.doc.transitions.filter((t) => t.id !== id)
    if (state.selection.id === id) select(null, null)
    touch()
  }

  function addVariable(): void {
    if (readOnly() || state.sim.running) return
    const used = new Set(state.doc.datamodel.map((d) => d.id))
    let i = state.doc.datamodel.length + 1
    while (used.has(`var${i}`)) i++
    captureUndo('addVariable')
    state.doc.datamodel.push({ id: `var${i}`, expr: '0' })
    touch()
  }

  function updateVariable(index: number, patch: Partial<DataVar>): string | null {
    if (readOnly() || state.sim.running) return '当前为只读/仿真中'
    const current = state.doc.datamodel[index]
    if (!current) return '变量不存在'
    if (patch.id !== undefined && patch.id !== current.id) {
      const err = checkVarId(index, patch.id.trim())
      if (err) return err
      patch = { ...patch, id: patch.id.trim() }
    }
    captureUndo(`updateVariable:${index}`)
    Object.assign(current, patch)
    touch()
    return null
  }

  function removeVariable(index: number): void {
    if (readOnly() || state.sim.running) return
    captureUndo('removeVariable')
    state.doc.datamodel.splice(index, 1)
    touch()
  }

  function checkVarId(index: number, id: string): string | null {
    if (!NCNAME_RE.test(id)) return '变量名非法'
    if (state.doc.datamodel.some((d, i) => i !== index && d.id === id)) return '变量名重复'
    const issue = checkVarName(policy, id)
    if (issue?.level === 'block') return formatNamingIssue(issue)
    return null
  }

  async function confirm(opts: {
    title: string
    message: string
    confirmLabel?: string
    tone?: 'danger' | 'primary'
  }): Promise<boolean> {
    if (state.confirm) state.confirm.resolve(false)
    return new Promise((resolve) => {
      state.confirm = {
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? labels.confirm,
        tone: opts.tone ?? 'danger',
        resolve,
      }
    })
  }

  function respondConfirm(ok: boolean): void {
    state.confirm?.resolve(ok)
    state.confirm = null
  }

  async function deleteState(uid: string): Promise<boolean> {
    const s = state.doc.states.find((x) => x.uid === uid)
    if (!s) return false
    const doomed = descendantsOf(state.doc, uid)
    doomed.add(uid)
    const kids = doomed.size - 1
    const trs = state.doc.transitions.filter((t) => doomed.has(t.source) || doomed.has(t.target)).length
    const parts = [`将删除状态「${s.label || s.id}」`]
    if (kids) parts.push(`及其 ${kids} 个子状态`)
    if (trs) parts.push(`及 ${trs} 条关联转移`)
    parts.push('，此操作不可撤销。')
    const ok = await confirm({ title: labels.delete, message: parts.join(''), confirmLabel: labels.delete })
    return ok ? removeState(uid) : false
  }

  async function deleteTransition(id: string): Promise<boolean> {
    const t = state.doc.transitions.find((x) => x.id === id)
    if (!t) return false
    const ok = await confirm({
      title: labels.delete,
      message: `将删除转移「${stateName(t.source)} → ${stateName(t.target)}」${t.event ? `（事件 ${t.event}）` : ''}。`,
      confirmLabel: labels.delete,
    })
    if (ok) removeTransition(id)
    return ok
  }

  async function deleteSelection(): Promise<void> {
    if (state.selection.kind === 'state' && state.selection.id) {
      await deleteState(state.selection.id)
    } else if (state.selection.kind === 'transition' && state.selection.id) {
      await deleteTransition(state.selection.id)
    }
  }

  async function validate(): Promise<boolean> {
    try {
      const result = await validateDocument(state.doc, {
        policy,
        ...(domParser ? { domParser } : {}),
      })
      // 上层模块的额外校验（全局变量是否声明、路由保留事件、MQTT 绑定…）
      const moduleIssues: ValidationIssue[] = []
      for (const validator of [...state.moduleValidators]) {
        try {
          const issues = await validator({ doc: state.doc, policy })
          moduleIssues.push(...issues.map(toValidationIssue))
        } catch (err) {
          pushLog('system', `模块校验失败：${errorMessage(err)}`, 'warn')
        }
      }
      const issues = [...result.issues, ...moduleIssues]
      const ok = result.ok && !moduleIssues.some((i) => i.severity === 'error')
      state.validation = { ok, issues }
      if (ok) {
        const hits = scanScriptActions(state.doc)
        if (hits.length) {
          const scriptIssues = scriptHitsToIssues(hits)
          pushLog('lifecycle', `${labels.validationPassed}；检测到 ${hits.length} 处自定义 JS`)
          openValidationDialog('草稿包含自定义 JS', scriptIssues)
        } else {
          pushLog('lifecycle', labels.validationPassed)
        }
      } else {
        pushLog('error', `${labels.validationFailed}（${issues.length} 项）`)
        openValidationDialog(labels.validationFailed, issues, result.source)
      }
      return ok
    } catch (err) {
      pushLog('error', `${labels.validationFailed}：${errorMessage(err)}`)
      return false
    }
  }

  /** 定位校验问题：选中状态/转移，必要时聚焦动作行 */
  function locateIssue(issue: ValidationIssue): void {
    if (issue.transitionId) {
      const t = state.doc.transitions.find((x) => x.id === issue.transitionId)
      if (t) {
        select('transition', t.id)
        return
      }
    }
    if (issue.event) {
      const t = state.doc.transitions.find((x) => x.event === issue.event)
      if (t) {
        select('transition', t.id)
        return
      }
    }
    if (!issue.stateId) return
    const s = state.doc.states.find((x) => x.id === issue.stateId)
    if (!s) return
    select('state', s.uid)
    if (issue.slot && issue.actionIndex !== undefined) {
      state.actionFocus = {
        uid: s.uid,
        slot: issue.slot,
        index: issue.actionIndex,
        nonce: (state.actionFocus?.nonce ?? 0) + 1,
      }
      if (actionFocusTimer) clearTimeout(actionFocusTimer)
      actionFocusTimer = setTimeout(() => {
        state.actionFocus = null
      }, 2500)
    }
  }

  function focusFor(uid: string, slot: 'entry' | 'exit' | 'transition'): number | null {
    const f = state.actionFocus
    return f && f.uid === uid && f.slot === slot ? f.index : null
  }

  function openValidationDialog(title: string, issues: ValidationIssue[], source?: string): void {
    state.validationDialog = { title, issues, ...(source !== undefined ? { source } : {}) }
  }

  function closeValidationDialog(): void {
    state.validationDialog = null
  }

  async function run(): Promise<boolean> {
    if (!state.doc.states.length) {
      pushLog('error', `无法启动：${labels.emptyDoc}`)
      return false
    }
    if (!(await validate())) return false
    try {
      await runner.start(serializeToScxml(state.doc))
      state.sim.running = true
      state.sim.paused = false
      state.sim.speed = runner.speed
      refreshVariables()
      return true
    } catch (err) {
      pushLog('error', `启动失败：${errorMessage(err)}`)
      return false
    }
  }

  async function stopSim(): Promise<void> {
    await runner.stop()
    state.sim.running = false
    state.sim.paused = false
    state.sim.activeIds = []
    state.sim.variables = null
  }

  function togglePause(): void {
    if (!state.sim.running) return
    if (state.sim.paused) runner.play()
    else runner.pause()
    state.sim.paused = runner.paused
  }

  function stepSim(): void {
    if (!state.sim.running) return
    runner.step()
    refreshVariables()
  }

  function setSpeed(n: number): void {
    const speed = runner.setSpeed(n)
    state.sim.speed = speed
  }

  function sendEvent(name: string, data?: unknown): void {
    if (!state.sim.running || !name) return
    runner.send(name, data, undefined, 'inject', 'sim')
    refreshVariables()
  }

  function refreshVariables(): void {
    state.sim.variables = state.sim.running ? runner.snapshot() : null
  }

  function assignVariable(id: string, expr: string): VariableWriteResult {
    const result = runner.assignVariable(id, expr)
    pushLog(result.ok ? 'send' : 'error', formatVariableResult(result))
    refreshVariables()
    return result
  }

  async function deploy(): Promise<void> {
    if (!adapter.deploy || state.deploying) return
    state.deploying = true
    try {
      await adapter.deploy(state.doc)
    } catch (err) {
      pushLog('error', `部署失败：${errorMessage(err)}`)
    } finally {
      state.deploying = false
    }
  }

  function exit(): void {
    if (!adapter.exit) return
    void saveNow().finally(() => adapter.exit?.(state.doc))
  }

  function clearLog(): void {
    state.sim.log = []
  }

  const editor: EditorStore = {
    state,
    labels,
    features,
    policy,
    adapter,
    runner,
    ready: Promise.resolve(),

    get doc() {
      return state.doc
    },
    get selection() {
      return state.selection
    },
    get sim() {
      return state.sim
    },
    get dirty() {
      return state.dirty
    },
    get saving() {
      return state.saving
    },
    get deploying() {
      return state.deploying
    },
    get readOnly() {
      return readOnly()
    },
    get locked() {
      return readOnly() || state.sim.running
    },
    get validation() {
      return state.validation
    },
    get validationDialog() {
      return state.validationDialog
    },
    get confirmRequest() {
      return state.confirm
    },
    get selectedState() {
      if (state.selection.kind !== 'state') return null
      return state.doc.states.find((s) => s.uid === state.selection.id) ?? null
    },
    get selectedTransition() {
      if (state.selection.kind !== 'transition') return null
      return state.doc.transitions.find((t) => t.id === state.selection.id) ?? null
    },
    get canUndo() {
      return !state.sim.running && !readOnly() && state.undoStack.length > 0
    },
    get canRedo() {
      return !state.sim.running && !readOnly() && state.redoStack.length > 0
    },
    get topStates() {
      return state.doc.states.filter((s) => s.parent === null)
    },
    get knownEvents() {
      return [...new Set(state.doc.transitions.map((t) => t.event).filter(Boolean))]
    },
    get activeLabels() {
      const map = uidMap(state.doc)
      return state.sim.activeIds
        .map((id) => {
          const s = [...map.values()].find((x) => x.id === id)
          return s ? s.label || s.id : id
        })
        .filter(Boolean)
    },
    get canDeploy() {
      return adapter.canDeploy?.() ?? true
    },
    get moduleTabs() {
      return state.moduleTabs
    },
    get moduleToolbar() {
      return state.moduleToolbar
    },

    focusFor,
    locateIssue,
    eventOptions(): EditorEventOption[] {
      return buildEditorEventOptions(state.doc, policy, state.externalEvents)
    },
    stateName,
    validateEventName,
    checkVarId,

    async init(): Promise<void> {
      if (options.initialDoc) {
        await loadDoc(options.initialDoc, { persist: false })
      } else if (options.autoLoad !== false && adapter.load) {
        try {
          const doc = await adapter.load()
          if (doc) await loadDoc(doc, { persist: false })
        } catch (err) {
          pushLog('system', `读取存档失败：${errorMessage(err)}`, 'warn')
        }
      }
      await refreshExternalEvents()
    },
    loadDoc,
    newDoc,
    openProject,
    saveProject,
    exportScxml,
    refreshExternalEvents,
    registerModule,

    captureUndo,
    touch,
    markDirty,
    scheduleSave,
    saveNow,
    undo,
    redo,

    addState,
    updateState,
    removeState,
    setParent,
    addTransition,
    updateTransition,
    removeTransition,
    addVariable,
    updateVariable,
    removeVariable,
    setDocMeta,
    select,
    deleteState,
    deleteTransition,
    deleteSelection,

    validate,
    run,
    stopSim,
    togglePause,
    stepSim,
    setSpeed,
    sendEvent,
    assignVariable,
    refreshVariables,

    confirm,
    respondConfirm,
    openValidationDialog,
    closeValidationDialog,
    pushLog,
    clearLog,
    deploy,
    exit,

    async destroy(): Promise<void> {
      if (destroyed) return
      destroyed = true
      for (const dispose of moduleDisposers.splice(0).reverse()) {
        try {
          dispose()
        } catch {
          /* 模块清理失败不影响编辑器销毁 */
        }
      }
      if (saveTimer) clearTimeout(saveTimer)
      if (actionFocusTimer) clearTimeout(actionFocusTimer)
      offRunner?.()
      offRunner = null
      await runner.stop()
      try {
        await saveNow()
      } catch {
        /* destroy 不抛 */
      }
    },
  }

  // runner → store
  offRunner = runner.on((ev) => {
    switch (ev.type) {
      case 'active':
        state.sim.activeIds = ev.ids
        refreshVariables()
        break
      case 'log':
        state.sim.log.push(ev.entry)
        if (state.sim.log.length > LOG_LIMIT) {
          state.sim.log.splice(0, state.sim.log.length - LOG_LIMIT)
        }
        adapter.onLog?.({
          time: ev.entry.time,
          level: ev.entry.level ?? 'info',
          text: ev.entry.text,
        })
        break
      case 'stopped':
        state.sim.running = false
        state.sim.paused = false
        state.sim.activeIds = []
        state.sim.variables = null
        break
      default:
        break
    }
  })

  for (const module of options.modules ?? []) editor.registerModule(module)
  editor.ready = editor.init()
  return editor
}
