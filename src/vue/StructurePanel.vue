<script setup lang="ts">
/**
 * 左栏结构编辑：状态树 + 按源状态分组的转移列表 + 新建转移表单。
 * 画布点击选中留在宿主/P4（官方 shadow DOM 契约较脆），这里保证表单路径完整。
 */
import { computed, ref, watch } from 'vue'
import type { StateNode, TransitionEdge } from '../core/model'
import { childrenOf } from '../core/model'
import { useEditor } from './use-editor'

const editor = useEditor()
const filter = ref('')
const q = computed(() => filter.value.trim().toLowerCase())

const source = ref('')
const target = ref('')
const newEvent = ref('')
const delayOn = ref(false)
const delayVal = ref(5)
const delayUnit = ref<'s' | 'ms'>('s')
const addError = ref('')

const events = computed(() => editor.eventOptions())
const eventNames = computed(() => [...new Set(events.value.map((e) => e.value))].sort((a, b) => a.localeCompare(b)))
const datalistId = 'sce-events'

watch(
  () => editor.doc.states.map((s) => s.uid).join(','),
  () => {
    if (!source.value) source.value = editor.selection.kind === 'state' ? editor.selection.id ?? '' : ''
    if (!target.value) target.value = ''
    if (source.value && !editor.doc.states.some((s) => s.uid === source.value)) source.value = ''
    if (target.value && !editor.doc.states.some((s) => s.uid === target.value)) target.value = ''
  },
  { immediate: true },
)
watch(
  () => editor.selection,
  (sel) => {
    if (sel.kind === 'state' && sel.id) source.value = sel.id
  },
)

function stateMatches(s: StateNode): boolean {
  return (
    q.value === '' ||
    (s.label ?? '').toLowerCase().includes(q.value) ||
    s.id.toLowerCase().includes(q.value)
  )
}
function subtreeHasMatch(uid: string): boolean {
  return childrenOf(editor.doc, uid).some((s) => stateMatches(s) || subtreeHasMatch(s.uid))
}

interface Row {
  state: StateNode
  depth: number
}
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const active = q.value !== ''
  const walk = (parent: string | null, depth: number): void => {
    for (const s of editor.doc.states.filter((x) => x.parent === parent)) {
      const container = s.kind === 'compound' || s.kind === 'parallel'
      if (active && !stateMatches(s) && !(container && subtreeHasMatch(s.uid))) continue
      out.push({ state: s, depth })
      if (container) walk(s.uid, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

const groups = computed<{ source: StateNode; items: TransitionEdge[] }[]>(() => {
  const out: { source: StateNode; items: TransitionEdge[] }[] = []
  for (const s of editor.doc.states) {
    const items = editor.doc.transitions.filter((t) => {
      if (t.source !== s.uid) return false
      if (!q.value) return true
      return [t.event, t.cond, editor.stateName(t.target)]
        .some((x) => (x ?? '').toLowerCase().includes(q.value))
    })
    if (items.length) out.push({ source: s, items })
  }
  return out
})

function kindLabel(kind: StateNode['kind']): string {
  return (
    { atomic: '状态', compound: '组合', final: '终态', parallel: '并行', history: '历史' }[kind] ??
    kind
  )
}

function selectState(uid: string): void {
  editor.select('state', uid)
}
function selectTransition(id: string): void {
  editor.select('transition', id)
}
async function delState(uid: string): Promise<void> {
  await editor.deleteState(uid)
}
async function delTransition(id: string): Promise<void> {
  await editor.deleteTransition(id)
}

function add(): void {
  addError.value = ''
  if (!source.value || !target.value) {
    addError.value = '请选择源状态和目标状态'
    return
  }
  const err = editor.addTransition(source.value, target.value, {
    ...(delayOn.value
      ? { delayMs: Math.max(10, Number(delayVal.value) || 10), delayUnit: delayUnit.value }
      : { event: newEvent.value }),
  })
  if (err) {
    addError.value = err
    return
  }
  newEvent.value = ''
}
</script>

<template>
  <div class="sce-panel sce-structure">
    <div class="sce-panel-head">
      <h3>{{ editor.labels.structure }}</h3>
      <span class="sce-count">{{ editor.doc.states.length }}</span>
    </div>

    <input v-model="filter" class="sce-filter" :placeholder="editor.labels.filter" />

    <div class="sce-btn-row">
      <button :disabled="editor.locked" @click="editor.addState('atomic')">{{ editor.labels.addState }}</button>
      <button :disabled="editor.locked" @click="editor.addState('compound')">{{ editor.labels.addCompound }}</button>
      <button :disabled="editor.locked" @click="editor.addState('parallel')">{{ editor.labels.addParallel }}</button>
      <button :disabled="editor.locked" @click="editor.addState('final')">{{ editor.labels.addFinal }}</button>
      <button :disabled="editor.locked" @click="editor.addState('history')">{{ editor.labels.addHistory }}</button>
    </div>

    <div v-if="!rows.length" class="sce-empty">{{ editor.labels.noStates }}</div>
    <ul v-else class="sce-tree">
      <li
        v-for="row in rows"
        :key="row.state.uid"
        class="sce-tree-row"
        :class="{ on: editor.selection.kind === 'state' && editor.selection.id === row.state.uid }"
        :style="{ paddingLeft: 8 + row.depth * 14 + 'px' }"
        @click="selectState(row.state.uid)"
      >
        <span class="sce-kind">{{ kindLabel(row.state.kind) }}</span>
        <span class="sce-tree-label">{{ row.state.label || row.state.id }}</span>
        <span class="sce-tree-id">{{ row.state.id }}</span>
        <button
          class="sce-icon-btn"
          :disabled="editor.locked"
          :title="editor.labels.delete"
          @click.stop="delState(row.state.uid)"
        >×</button>
      </li>
    </ul>

    <div class="sce-panel-head">
      <h3>{{ editor.labels.transitions }}</h3>
      <span class="sce-count">{{ editor.doc.transitions.length }}</span>
    </div>

    <div class="sce-transition-form">
      <div class="sce-field-row">
        <label>{{ editor.labels.source }}</label>
        <select v-model="source" :disabled="editor.locked">
          <option value="" disabled>{{ editor.labels.source }}</option>
          <option v-for="s in editor.doc.states" :key="s.uid" :value="s.uid">{{ s.label || s.id }}</option>
        </select>
      </div>
      <div class="sce-field-row">
        <label>{{ editor.labels.target }}</label>
        <select v-model="target" :disabled="editor.locked">
          <option value="" disabled>{{ editor.labels.target }}</option>
          <option v-for="s in editor.doc.states" :key="s.uid" :value="s.uid">{{ s.label || s.id }}</option>
        </select>
      </div>
      <div class="sce-field-row">
        <label>{{ editor.labels.event }}</label>
        <input v-model="newEvent" :list="datalistId" :placeholder="editor.labels.eventHint" :disabled="editor.locked || delayOn" />
      </div>
      <datalist :id="datalistId">
        <option v-for="name in eventNames" :key="name" :value="name" />
      </datalist>
      <div class="sce-field-row">
        <label>
          <input v-model="delayOn" type="checkbox" :disabled="editor.locked" />
          {{ editor.labels.delay }}
        </label>
        <template v-if="delayOn">
          <input v-model.number="delayVal" class="sce-num" type="number" min="10" step="10" :disabled="editor.locked" />
          <select v-model="delayUnit" :disabled="editor.locked">
            <option value="s">{{ editor.labels.sequence }}</option>
            <option value="ms">{{ editor.labels.milliseconds }}</option>
          </select>
        </template>
      </div>
      <button class="sce-primary sce-wide" :disabled="editor.locked" @click="add">{{ editor.labels.addTransition }}</button>
      <p v-if="addError" class="sce-error">{{ addError }}</p>
    </div>

    <div v-if="!groups.length" class="sce-empty">{{ editor.labels.noTransitions }}</div>
    <div v-for="g in groups" :key="g.source.uid" class="sce-transition-group">
      <div class="sce-group-title">{{ g.source.label || g.source.id }}</div>
      <div
        v-for="t in g.items"
        :key="t.id"
        class="sce-transition-row"
        :class="{ on: editor.selection.kind === 'transition' && editor.selection.id === t.id }"
        @click="selectTransition(t.id)"
      >
        <span class="sce-event">{{ t.event || 'ε' }}</span>
        <span class="sce-arrow">→</span>
        <span class="sce-target">{{ editor.stateName(t.target) }}</span>
        <span v-if="t.delayMs !== undefined" class="sce-tag">⏱ {{ t.delayMs }}ms</span>
        <button class="sce-icon-btn" :disabled="editor.locked" @click.stop="delTransition(t.id)">×</button>
      </div>
    </div>
  </div>
</template>
