/**
 * P3 编辑器 store 验证（不依赖 SFC/浏览器）：
 *   A. adapter 注入：初始文档、外部事件、保存
 *   B. 文档 CRUD + 撤销/重做
 *   C. 命名校验（策略注入）+ 变量校验
 *   D. 校验/运行/停止（happy-dom DOMParser）
 *   E. 确认对话框 + destroy 清理
 *
 * 运行：npm run test:editor
 */
import { Window } from 'happy-dom'
import type { DOMParserLike } from '@tinyactors/scxmljs/trusted'
import { emptyDoc, type ProjectDoc } from '../src/core/model'
import { setInternalOnlyEvent } from '../src/core/event-visibility'
import { serializeToScxml } from '../src/core/serializer'
import { createEditor, type CreateEditorOptions } from '../src/vue/editor-store'
import { matchTransitionId } from '../src/vue/canvas-select'
import { CANVAS_MAX, fitScale, growCanvas } from '../src/vue/canvas-fit'
import { resolveFeatures } from '../src/vue/features'
import type { EditorAdapter } from '../src/vue/types'
import type { Component } from 'vue'
import type { EditorModule } from '../src/vue/modules'
import { SERVER_POLICY } from './fixtures/server-policy'

let pass = 0
let fail = 0
function assert(cond: unknown, msg: string): void {
  if (cond) {
    pass++
    console.log('  OK', msg)
  } else {
    fail++
    console.error('  FAIL:', msg)
  }
}

const domParser = new (new Window().DOMParser)() as unknown as DOMParserLike

function demoDoc(): ProjectDoc {
  return emptyDoc('editor-test')
}

function makeEditor(overrides: Partial<CreateEditorOptions> = {}, adapter: Partial<EditorAdapter> = {}) {
  const saved: ProjectDoc[] = []
  const base: EditorAdapter = {
    load: () => null,
    save: (doc) => {
      saved.push(JSON.parse(JSON.stringify(doc)) as ProjectDoc)
    },
    externalEvents: () => [{ value: 'ext.tick', tag: 'clock' }],
    ...adapter,
  }
  const editor = createEditor({
    initialDoc: demoDoc(),
    adapter: base,
    autoLoad: false,
    domParser,
    policy: SERVER_POLICY,
    ...overrides,
  } as CreateEditorOptions)
  return { editor, saved, adapter: base }
}

async function wait(ms = 30): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

console.log('── A) adapter / 初始化 ──')
{
  const { editor } = makeEditor()
  await editor.ready
  assert(editor.doc.formatVersion === 1 && editor.doc.name === 'editor-test', '初始文档注入')
  assert(editor.adapter.externalEvents !== undefined, 'adapter 外部事件能力保留')
  assert(editor.features.structure && !editor.features.deploy, 'features 默认/覆盖')
  await editor.destroy()
}

console.log('── B) CRUD + 撤销/重做 ──')
{
  const { editor } = makeEditor()
  await editor.ready
  editor.addState('atomic')
  const a = editor.doc.states[0]!
  editor.addState('atomic')
  const b = editor.doc.states[1]!
  assert(editor.doc.states.length === 2 && editor.selection.kind === 'state', '新增两个状态并选中最后一个')

  const err = editor.addTransition(a.uid, b.uid, { event: 'go' })
  assert(err === null && editor.doc.transitions.length === 1 && editor.doc.transitions[0]!.event === 'go', '新增事件转移')

  const delayErr = editor.addTransition(b.uid, a.uid, { delayMs: 3000, delayUnit: 's' })
  const delayed = editor.doc.transitions[1]!
  assert(delayErr === null && delayed.event === `delay3s_${b.id}_to_${a.id}` && delayed.delayMs === 3000, '内部延迟转移自动命名')

  editor.undo()
  assert(editor.doc.transitions.length === 1, '撤销删除延迟转移')
  editor.redo()
  assert(editor.doc.transitions.length === 2, '重做恢复延迟转移')

  editor.setDocMeta({ name: 'renamed' })
  assert(editor.doc.name === 'renamed' && editor.dirty, '文档元数据 + dirty')
  await editor.destroy()
}

console.log('── B2) targetless 转移 / donedata ──')
{
  const { editor } = makeEditor()
  await editor.ready
  editor.addState('atomic')
  const a = editor.doc.states[0]!
  editor.addState('atomic')
  const b = editor.doc.states[1]!

  const err = editor.addTransition(a.uid, null, { event: 'ping' })
  const t = editor.doc.transitions[0]!
  assert(err === null && t.target === null && t.transitionType === 'internal', '新增无 target 的内部转移')
  assert(editor.stateName(null) === editor.labels.noTarget, 'stateName(null) 显示内部转移')

  const delayErr = editor.addTransition(b.uid, null, { delayMs: 2000, delayUnit: 's' })
  const delayed = editor.doc.transitions[1]!
  assert(delayErr === null && delayed.event === `delay2s_${b.id}_to_internal`, 'targetless 延时自动名使用 _to_internal')

  editor.updateTransition(t.id, { actions: ['send pong'] })
  assert(editor.doc.transitions[0]!.actions[0] === 'send pong', 'targetless 转移可编辑动作')

  editor.undo()
  assert(editor.doc.transitions[0]!.actions.length === 0, 'targetless 编辑可撤销')
  editor.redo()
  assert(editor.doc.transitions[0]!.actions[0] === 'send pong', 'targetless 编辑可重做')

  const current = editor.doc.transitions.find((x) => x.id === t.id)!
  editor.updateTransition(current.id, { target: b.uid })
  assert(editor.doc.transitions.find((x) => x.id === t.id)?.target === b.uid, '已有转移可改 target')
  editor.updateTransition(current.id, { target: null })
  assert(editor.doc.transitions.find((x) => x.id === t.id)?.target === null, '已有转移可改回无 target')
  editor.updateTransition(current.id, { transitionType: 'external' })
  assert(editor.doc.transitions.find((x) => x.id === t.id)?.transitionType === 'external', '可切换 transitionType')

  const delayedId = delayed.id
  editor.updateTransition(delayedId, { target: a.uid })
  assert(
    editor.doc.transitions.find((x) => x.id === delayedId)?.event === `delay2s_${b.id}_to_${a.id}`,
    '改 target 后延时事件名重算',
  )

  editor.addState('final')
  const done = editor.doc.states[2]!
  const doneErr = editor.updateState(done.uid, { doneData: { expr: "'ok'" } })
  assert(doneErr === null && serializeToScxml(editor.doc).includes('<donedata>'), 'final doneData 可写入并序列化')
  const contentErr = editor.updateState(done.uid, { doneData: { content: '{"a":1}' } })
  assert(contentErr === null && serializeToScxml(editor.doc).includes('<content>'), 'doneData content 可写入并序列化')
  const paramsErr = editor.updateState(done.uid, { doneData: { params: [{ name: 'x', expr: '42' }] } })
  assert(paramsErr === null && serializeToScxml(editor.doc).includes('<param name="x" expr="42"/>'), 'doneData param 可写入并序列化')
  const nonFinalErr = editor.updateState(a.uid, { doneData: { expr: '1' } })
  assert(nonFinalErr !== null, '非 final 写入 doneData 被拒绝')
  await editor.destroy()
}

console.log('── B3) 画布转移标签匹配 ──')
{
  assert(resolveFeatures({}).explorer === false, 'Explorer 默认关闭')
  assert(resolveFeatures({ explorer: true }).explorer === true, 'Explorer 可由 feature flag 打开')
  assert(resolveFeatures({}).resizablePanes === false, '可调宽侧栏默认关闭')
  assert(resolveFeatures({ resizablePanes: true }).resizablePanes === true, '可调宽侧栏可由 feature flag 打开')

  const fit = fitScale(900, 600, 1200, 500)
  assert(Math.abs(fit - (900 - 32) / 1200) < 1e-9, '画布 fit 按内容宽高取最小比例')
  const grown = growCanvas(6000, 4000, 7000, 5000)
  assert(grown.changed && grown.width === 7024 && grown.height === 5024, '内容超画布时按内容扩容')
  const capped = growCanvas(6000, 4000, 30000, 30000)
  assert(capped.width === CANVAS_MAX && capped.height === CANVAS_MAX, '画布扩容有上限')

  const en = createEditor({
    locale: 'en',
    diagnostics: { formatVariableResult: () => 'custom-diagnostic' },
  })
  assert(en.labels.save === 'Save', 'locale=en 使用英文 labels')
  assert(
    en.diagnostics.formatVariableResult({
      ok: false,
      code: 'variable.session-not-running',
      params: {},
    }) === 'custom-diagnostic',
    'diagnostics 可注入 formatter',
  )
  await en.destroy()
  const doc = emptyDoc('canvas-select')
  const a = { uid: 'a1', id: 'a', label: 'a', kind: 'atomic' as const, parent: null, initial: null, entryActions: [], exitActions: [] }
  const b = { uid: 'b1', id: 'b', label: 'b', kind: 'atomic' as const, parent: null, initial: null, entryActions: [], exitActions: [] }
  doc.states = [a, b]
  doc.transitions = [
    { id: 't-internal', source: a.uid, target: null, event: 'ping', cond: '', actions: [] },
    { id: 't-edge', source: a.uid, target: b.uid, event: 'go', cond: 'x > 0', actions: [] },
  ]
  assert(
    matchTransitionId(doc, { events: ['ping'], condText: '', targets: [], eventless: 'ε' }) === 't-internal',
    'targetless chip 标签匹配到内部转移',
  )
  assert(
    matchTransitionId(doc, { events: ['go'], condText: '[x > 0]', targets: ['b'], eventless: 'ε' }) === 't-edge',
    '有 target 的标签按事件/条件/目标匹配',
  )
  assert(
    matchTransitionId(doc, { events: ['go'], condText: '[x > …]', targets: ['b'], eventless: 'ε' }) === 't-edge',
    '官方截断的 cond 按前缀匹配',
  )
  assert(
    matchTransitionId(doc, { events: ['go'], condText: '', targets: ['b'], eventless: 'ε' }) === null,
    '缺少 cond 时不匹配带条件转移',
  )
  doc.transitions.push({ id: 't-guard', source: a.uid, target: b.uid, event: 'guarded', cond: '', actions: [] })
  assert(
    matchTransitionId(doc, {
      events: ['guarded'],
      condText: "[_event.type === 'inte…]",
      targets: ['b'],
      eventless: 'ε',
    }) === 't-guard',
    'internal-only 生成守卫不影响画布转移选中',
  )
}

console.log('── C) 命名/变量校验 ──')
{
  const { editor } = makeEditor()
  await editor.ready
  assert(editor.validateEventName('t_tick') !== null, 'SERVER_POLICY 拦截 t_ 事件')
  assert(editor.validateEventName('ge_ok') === null, 'ge_ 事件合法')
  editor.addVariable()
  const v = editor.doc.datamodel[0]!
  assert(editor.checkVarId(0, 'g_old') !== null, 'g_ 变量名被拦截')
  assert(editor.checkVarId(0, 'gv_count') === null, 'gv_ 变量名合法')
  assert(editor.updateVariable(0, { id: 'g_old' }) !== null, 'updateVariable 拦截废弃前缀')
  assert(editor.updateVariable(0, { id: 'gv_count' }) === null && v.id === 'gv_count', 'updateVariable 改名成功')
  await editor.destroy()
}

console.log('── D) 校验 / 运行 / 停止 ──')
{
  const { editor } = makeEditor()
  await editor.ready
  editor.addState('atomic')
  const a = editor.doc.states[0]!
  editor.addState('final')
  const b = editor.doc.states[1]!
  editor.addTransition(a.uid, b.uid, { event: 'go' })
  assert(await editor.validate(), '合法文档校验通过')
  assert(!editor.validationDialog, '成功不弹窗')

  const ran = await editor.run()
  assert(ran && editor.sim.running, '仿真启动')
  await wait(50)
  assert(editor.activeLabels.length === 1, '初始激活状态可见')
  editor.sendEvent('go')
  await editor.runner.settled()
  assert(editor.sim.variables !== null, 'snapshot 可用')
  await editor.stopSim()
  assert(!editor.sim.running, '停止后 running=false')
  await editor.destroy()
}

console.log('── D2) 运行时自定义 JS 不弹窗，显式校验才弹窗 ──')
{
  const doc = emptyDoc('script-warning')
  doc.states = [
    {
      uid: 's1',
      id: 'a',
      label: 'a',
      kind: 'atomic',
      parent: null,
      entryActions: ['let marker = 1'],
      exitActions: [],
    },
  ]
  doc.initial = 's1'
  const { editor } = makeEditor({ initialDoc: doc })
  await editor.ready
  const ran = await editor.run()
  assert(ran && editor.sim.running, '含自定义 JS 时仿真仍可启动')
  assert(!editor.validationDialog, 'run() 不弹自定义 JS 弹窗')
  await editor.stopSim()
  assert(await editor.validate(), '显式校验通过')
  assert(editor.validationDialog?.title === '草稿包含自定义 JS', '显式校验仍弹自定义 JS 弹窗')
  editor.closeValidationDialog()
  await editor.destroy()
}

console.log('── D3) 事件可见性设置与外部注入拦截 ──')
{
  const doc = emptyDoc('visibility')
  doc.states = [
    { uid: 's1', id: 'a', label: 'a', kind: 'atomic', parent: null, entryActions: [], exitActions: [] },
    { uid: 's2', id: 'b', label: 'b', kind: 'atomic', parent: null, entryActions: [], exitActions: [] },
  ]
  doc.initial = 's1'
  doc.transitions = [{ id: 't1', source: 's1', target: 's2', event: 'go', cond: '', actions: [] }]
  setInternalOnlyEvent(doc, 'go', true)
  const { editor } = makeEditor({ initialDoc: doc })
  await editor.ready
  assert(await editor.run(), 'internal-only 文档可启动仿真')
  editor.sendEvent('go')
  assert(editor.sim.log.some((l) => l.text.includes('仅允许内部触发')), '编辑器拒绝外部注入 internal-only 事件')
  assert(editor.activeLabels.length === 1, '被拒绝后仍停留在原状态')
  await editor.stopSim()
  editor.clearInternalOnly('go')
  assert(!editor.doc.internalOnlyEvents?.includes('go'), '设回双向会移除仅内部记录')
  setInternalOnlyEvent(editor.doc, 'go', true)
  assert(editor.doc.internalOnlyEvents?.includes('go'), '设置仅内部写入 internalOnlyEvents')
  editor.updateTransition('t1', { event: 'go.renamed' })
  assert(!editor.doc.internalOnlyEvents?.length, '事件改名后清理 internalOnlyEvents')
  await editor.destroy()
}

console.log('── H) initial 不变量（KIT-016）──')
{
  const { editor } = makeEditor()
  await editor.ready
  editor.addState('compound')
  const root = editor.doc.states[0]!
  assert(editor.doc.initial === root.uid, '第一个顶层状态回填根 initial')

  editor.addState('atomic', root.uid)
  const first = editor.doc.states.find((s) => s.parent === root.uid)!
  assert(root.initial === first.uid, '空 compound 的第一个子状态回填 initial')

  editor.addState('atomic', root.uid)
  const second = editor.doc.states.filter((s) => s.parent === root.uid)[1]!
  assert(root.initial === first.uid, '添加第二个子状态不覆盖 initial')

  editor.removeState(first.uid)
  assert(root.initial === second.uid, '删除 initial 子状态后回填剩余第一个')

  editor.removeState(second.uid)
  assert(root.initial === null, '删除最后一个子状态后 initial 为 null')

  editor.addState('compound', null)
  const other = editor.doc.states.find((s) => s.kind === 'compound' && s.uid !== root.uid)!
  editor.addState('atomic', root.uid)
  const movable = editor.doc.states.find((s) => s.parent === root.uid)!
  editor.setParent(movable.uid, other.uid)
  assert(other.initial === movable.uid, '移入空 compound 后设置新父级 initial')
  assert(root.initial === null, '旧父级无子状态时 initial 为 null')

  editor.addState('history', root.uid)
  editor.addState('atomic', root.uid)
  const nonHistory = editor.doc.states.find((s) => s.parent === root.uid && s.kind === 'atomic')!
  assert(root.initial === nonHistory.uid, 'history 不作为 compound initial')
  assert(editor.doc.initial === root.uid, '根 initial 在结构编辑后仍可用')
  await editor.destroy()
}

console.log('── E) 确认 / 删除 / 保存 ──')
{
  const { editor, saved } = makeEditor()
  await editor.ready
  editor.addState('atomic')
  const uid = editor.doc.states[0]!.uid
  const pending = editor.deleteState(uid)
  assert(editor.confirmRequest !== null, '删除先弹确认')
  editor.respondConfirm(true)
  const removed = await pending
  assert(removed && editor.doc.states.length === 0, '确认后删除状态')
  await editor.saveNow()
  assert(saved.length > 0, 'adapter.save 收到文档')
  await editor.destroy()
}

console.log('── F) 外部事件进入候选 ──')
{
  const { editor } = makeEditor()
  await editor.ready
  const opts = editor.eventOptions()
  assert(opts.some((o) => o.value === 'ext.tick' && o.group === 'in'), 'adapter 外部事件进入 in 组')
  await editor.destroy()
}


console.log('── G) 编辑器模块契约 ──')
{
  const Dummy = { name: 'DummyPanel', render: () => null } as unknown as Component
  let runCount = 0
  let disposed = false
  const mod: EditorModule = {
    id: 'test.host',
    setup(ctx) {
      ctx.tabs.add({ id: 'globals', title: '全局变量', component: Dummy, order: 10 })
      ctx.toolbar.add({
        id: 'deploy',
        label: '部署',
        run: () => {
          runCount++
        },
      })
      ctx.eventSources.add({
        id: 'routes',
        provide: () => [{ value: 'route.in', tag: '路由' }],
      })
      ctx.validators.add(() => [
        { code: 'host.global-undeclared', params: { name: 'gv_x' }, stateId: 'idle' },
      ])
      ctx.variableFields.add({
        id: 'host.variable.global',
        key: 'global',
        label: '全局',
        type: 'boolean',
        defaultValue: false,
      })
      ctx.eventFields.add({
        id: 'host.event.broadcast',
        key: 'broadcast',
        label: '广播',
        type: 'boolean',
        defaultValue: false,
      })
      ctx.onDispose(() => {
        disposed = true
      })
    },
  }
  const { editor } = makeEditor({ modules: [mod] })
  await editor.ready
  assert(editor.moduleTabs.map((t) => t.id).join(',') === 'globals', '模块贡献右侧标签页')
  assert(editor.moduleToolbar.map((t) => t.id).join(',') === 'deploy', '模块贡献工具栏命令')
  assert(editor.eventOptions().some((o) => o.value === 'route.in' && o.group === 'in'), '模块贡献外部事件来源')
  assert(editor.variableFields.map((f) => f.key).join(',') === 'global', '模块贡献变量字段')
  assert(editor.eventFields.map((f) => f.key).join(',') === 'broadcast', '模块贡献事件字段')
  editor.addVariable()
  editor.setVariableAttr(0, 'global', true)
  assert(editor.doc.datamodel[0]?.attrs?.global === true, '变量属性写入 DataVar.attrs')
  editor.setEventAttr('route.in', 'broadcast', true)
  assert(editor.doc.eventAttrs?.['route.in']?.broadcast === true, '事件属性写入 ProjectDoc.eventAttrs')
  editor.setEventAttr('route.in', 'broadcast', undefined)
  assert(!editor.doc.eventAttrs?.['route.in'], '空事件属性清理')
  const ok = await editor.validate()
  assert(!ok && editor.validation?.issues.some((i) => i.code === 'host.global-undeclared' && i.kind === 'module'), '模块校验问题进入统一 validation')
  await editor.moduleToolbar[0]!.run(editor)
  assert(runCount === 1, '模块命令可执行')
  await editor.destroy()
  assert(disposed && editor.moduleTabs.length === 0 && editor.variableFields.length === 0 && editor.eventFields.length === 0, 'destroy 执行模块清理并移除贡献')

  // setup 抛错隔离
  const bad: EditorModule = {
    id: 'test.bad',
    setup() {
      throw new Error('boom')
    },
  }
  const { editor: e2 } = makeEditor({ modules: [bad] })
  await e2.ready
  assert(e2.sim.log.some((l) => l.kind === 'error' && l.text.includes('test.bad')), '模块 setup 抛错被隔离并记录')
  await e2.destroy()
}

console.log('── P2) 仅内部：扫描 / 弹窗 / 修复 / 校验错误 ──')
{
  const doc = emptyDoc('legacy-external')
  doc.states = [
    { uid: 's1', id: 'a', label: 'a', kind: 'atomic', parent: null, entryActions: [], exitActions: [] },
    { uid: 's2', id: 'b', label: 'b', kind: 'atomic', parent: null, entryActions: [], exitActions: [] },
  ]
  doc.initial = 's1'
  doc.transitions = [{ id: 't1', source: 's1', target: 's2', event: 'go', cond: '', actions: [] }]
  ;(doc as ProjectDoc & { eventVisibility?: Record<string, string> }).eventVisibility = {
    go: 'external',
  }
  const { editor } = makeEditor({ initialDoc: doc })
  await editor.ready
  assert(!editor.isInternalOnly('go'), '旧 external 草稿在编辑器内降级为双向')
  await editor.destroy()
}
{
  const doc = emptyDoc('event-attrs-rename')
  doc.states = [
    { uid: 's1', id: 'a', label: 'a', kind: 'atomic', parent: null, entryActions: [], exitActions: [] },
    { uid: 's2', id: 'b', label: 'b', kind: 'atomic', parent: null, entryActions: [], exitActions: [] },
  ]
  doc.initial = 's1'
  doc.transitions = [{ id: 't1', source: 's1', target: 's2', event: 'go', cond: '', actions: [] }]
  const { editor } = makeEditor({ initialDoc: doc })
  await editor.ready
  editor.setEventAttr('go', 'topic', 'demo/x')
  editor.updateTransition('t1', { event: 'go2' })
  assert(editor.doc.eventAttrs?.go2?.topic === 'demo/x', '事件改名迁移 eventAttrs')
  assert(!editor.doc.eventAttrs?.go, '事件改名清理旧 eventAttrs')
  await editor.destroy()
}
{
  const st = (uid: string, id: string, entryActions: string[] = []) => ({
    uid,
    id,
    label: id,
    kind: 'atomic' as const,
    parent: null,
    entryActions,
    exitActions: [],
  })
  async function internalEditor(
    entry: string[],
    build?: (doc: ProjectDoc) => void,
  ) {
    const doc = emptyDoc('internal-p2')
    doc.states = [st('s1', 'a', entry), st('s2', 'b')]
    doc.initial = 's1'
    doc.transitions = [{ id: 't1', source: 's1', target: 's2', event: 'go', cond: '', actions: [] }]
    build?.(doc)
    const { editor } = makeEditor({ initialDoc: doc })
    await editor.ready
    return editor
  }

  // 1) 干净的生产者：弹窗可直接确认
  {
    const editor = await internalEditor(['raise go'])
    editor.requestInternalOnly('go')
    assert(
      editor.internalEventDialog?.scan.canConfirm === true &&
        editor.internalEventDialog.scan.conflicts === 0,
      'raise 生产者：扫描无冲突',
    )
    editor.confirmInternalOnly()
    assert(
      editor.isInternalOnly('go') && editor.doc.internalOnlyEvents?.includes('go'),
      '确认后写入 internalOnlyEvents',
    )
    assert(editor.internalEventDialog === null, '确认后关闭弹窗')
    await editor.destroy()
  }

  // 2) 普通 send：弹窗冲突，一键改内部发送后可确认
  {
    const editor = await internalEditor(['send go'])
    editor.requestInternalOnly('go')
    const producer = editor.internalEventDialog?.scan.producers[0]
    assert(
      editor.internalEventDialog?.scan.canConfirm === false &&
        producer?.conflict === true &&
        producer.canFix === true,
      '普通 send：扫描报冲突且可一键修复',
    )
    editor.confirmInternalOnly()
    assert(!editor.isInternalOnly('go') && editor.internalEventDialog !== null, '冲突时确认不生效')
    editor.fixInternalOnlyProducer(producer!.id)
    assert(
      editor.doc.states[0]?.entryActions[0] === 'send go target #_internal',
      '一键修复写入 target="#_internal"',
    )
    assert(editor.internalEventDialog?.scan.canConfirm === true, '修复后扫描通过')
    editor.confirmInternalOnly()
    assert(editor.isInternalOnly('go'), '修复后确认生效')
    await editor.destroy()
  }

  // 3) send delay：不可自动修复
  {
    const editor = await internalEditor(['send go delay 1s id go'])
    editor.requestInternalOnly('go')
    const producer = editor.internalEventDialog?.scan.producers[0]
    assert(
      producer?.conflict === true && producer.canFix === false,
      'send delay：报冲突且不能自动修复',
    )
    editor.confirmInternalOnly()
    assert(!editor.isInternalOnly('go'), 'send delay：冲突时确认不生效')
    await editor.destroy()
  }

  // 4) 混合监听者：需拆分转移
  {
    const editor = await internalEditor(['raise go'], (doc) => {
      doc.transitions.push({ id: 't2', source: 's1', target: 's2', event: 'go other', cond: '', actions: [] })
    })
    editor.requestInternalOnly('go')
    const listener = editor.internalEventDialog?.scan.listeners.find((x) => x.transitionId === 't2')
    assert(listener?.mixed === true, '混合事件监听者被标为 mixed')
    assert(editor.internalEventDialog?.scan.canConfirm === false, '混合监听者阻止确认')
    await editor.destroy()
  }

  // 5) #_internal + delay：引擎会丢弃，扫描报冲突
  {
    const editor = await internalEditor(['send go target #_internal delay 1s id go'])
    editor.requestInternalOnly('go')
    const producer = editor.internalEventDialog?.scan.producers[0]
    assert(
      producer?.reason === 'internal-delay' && producer.conflict && !producer.canFix,
      '#_internal + delay：扫描报 internal-delay 冲突',
    )
    await editor.destroy()
  }

  // 6) 会话内不再提示
  {
    const editor = await internalEditor(['raise go'])
    editor.requestInternalOnly('go')
    editor.confirmInternalOnly(true)
    assert(editor.internalOnlySuppressed === true, '勾选后写入会话内抑制状态')
    editor.clearInternalOnly('go')
    assert(!editor.isInternalOnly('go'), '取消仅内部')
    editor.requestInternalOnly('go')
    assert(
      editor.internalEventDialog === null && editor.isInternalOnly('go'),
      '抑制后干净事件直接生效、不再弹窗',
    )
    await editor.destroy()
  }

  // 7) 校验错误：外部生产者 / 混合事件 / 内部延时
  {
    const editor = await internalEditor(['send go'])
    setInternalOnlyEvent(editor.doc, 'go', true)
    const ok = await editor.validate()
    assert(!ok, '普通 send + 仅内部：校验失败')
    assert(
      editor.validationDialog?.issues.some(
        (i) => i.code === 'structure.event.internal-only-with-external-producer',
      ) === true,
      '校验弹窗报 internal-only-with-external-producer',
    )
    await editor.destroy()
  }
  {
    const editor = await internalEditor(['raise go'], (doc) => {
      doc.transitions.push({ id: 't2', source: 's1', target: 's2', event: 'go other', cond: '', actions: [] })
    })
    setInternalOnlyEvent(editor.doc, 'go', true)
    const ok = await editor.validate()
    assert(!ok, '混合事件：校验失败')
    assert(
      editor.validationDialog?.issues.some(
        (i) => i.code === 'structure.transition.mixed-event-visibility',
      ) === true,
      '校验弹窗报 mixed-event-visibility',
    )
    await editor.destroy()
  }
  {
    const editor = await internalEditor(['send go target #_internal delay 1s id go'])
    const ok = await editor.validate()
    assert(!ok, '#_internal + delay：校验失败')
    assert(
      editor.validationDialog?.issues.some(
        (i) => i.code === 'structure.action.internal-delay-unsupported',
      ) === true,
      '校验弹窗报 internal-delay-unsupported',
    )
    await editor.destroy()
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
