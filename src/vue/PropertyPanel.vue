<script setup lang="ts">
/**
 * 右栏属性：状态 / 转移 / 文档级元数据。
 * 动作先用 textarea（每行一条 DSL）；结构化动作编辑器留给宿主增强（P4）。
 */
import { computed, ref, watch } from 'vue'
import { descendantsOf } from '../core/model'
import type { StateKind, StateNode } from '../core/model'
import { isAutoDelayEvent } from '../core/naming'
import { useEditor } from './use-editor'

const editor = useEditor()
const st = computed(() => editor.selectedState)
const tr = computed(() => editor.selectedTransition)

const id = ref('')
const label = ref('')
const kind = ref<StateKind>('atomic')
const parent = ref('')
const initial = ref('')
const historyType = ref<'shallow' | 'deep'>('shallow')
const entry = ref('')
const exit = ref('')
const idErr = ref('')

const event = ref('')
const cond = ref('')
const actions = ref('')
const delayOn = ref(false)
const delayMs = ref(5000)
const delayUnit = ref<'s' | 'ms'>('s')
const eventErr = ref('')

function lines(text: string): string[] {
  return text.split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0)
}

watch(
  st,
  (s) => {
    idErr.value = ''
    if (!s) return
    id.value = s.id
    label.value = s.label
    kind.value = s.kind
    parent.value = s.parent ?? ''
    initial.value = s.initial ?? ''
    historyType.value = s.historyType ?? 'shallow'
    entry.value = s.entryActions.join('\n')
    exit.value = s.exitActions.join('\n')
  },
  { immediate: true },
)

watch(
  tr,
  (t) => {
    eventErr.value = ''
    if (!t) return
    event.value = t.event
    cond.value = t.cond
    actions.value = t.actions.join('\n')
    delayOn.value = t.delayMs !== undefined
    delayMs.value = t.delayMs ?? 5000
    delayUnit.value = t.delayUnit ?? 's'
  },
  { immediate: true },
)

watch(
  () => tr.value?.event,
  (v) => {
    if (v !== undefined && v !== event.value) event.value = v
  },
)

const parentOptions = computed(() => {
  const s = st.value
  if (!s) return []
  const allowed: StateKind[] = s.kind === 'atomic' || s.kind === 'final' ? ['compound'] : ['compound', 'parallel']
  const banned = descendantsOf(editor.doc, s.uid)
  banned.add(s.uid)
  return editor.doc.states.filter((x) => allowed.includes(x.kind) && !banned.has(x.uid))
})
const initialKids = computed(() =>
  st.value ? editor.doc.states.filter((s) => s.parent === st.value!.uid && s.kind !== 'history') : [],
)
const eventNames = computed(() =>
  [...new Set(editor.eventOptions().map((e) => e.value))].sort((a, b) => a.localeCompare(b)),
)
const datalistId = 'sce-events-prop'

function commitId(): void {
  if (!st.value) return
  const err = editor.updateState(st.value.uid, { id: id.value })
  idErr.value = err ?? ''
  if (err) id.value = st.value.id
}
function commitLabel(): void {
  if (st.value) editor.updateState(st.value.uid, { label: label.value })
}
function commitKind(): void {
  if (!st.value) return
  const err = editor.updateState(st.value.uid, { kind: kind.value })
  if (err) {
    idErr.value = err
    kind.value = st.value.kind
  }
}
function commitParent(): void {
  if (st.value) editor.setParent(st.value.uid, parent.value || null)
}
function commitInitial(): void {
  if (st.value) editor.updateState(st.value.uid, { initial: initial.value || null })
}
function commitHistoryType(): void {
  if (st.value) editor.updateState(st.value.uid, { historyType: historyType.value })
}
function commitEntry(): void {
  if (st.value) editor.updateState(st.value.uid, { entryActions: lines(entry.value) })
}
function commitExit(): void {
  if (st.value) editor.updateState(st.value.uid, { exitActions: lines(exit.value) })
}

function commitEvent(): void {
  if (!tr.value) return
  const name = event.value.trim()
  if (name) {
    const err = editor.validateEventName(name, tr.value.id)
    if (err) {
      eventErr.value = err
      return
    }
  }
  eventErr.value = ''
  editor.updateTransition(tr.value.id, { event: name })
}
function commitCond(): void {
  if (tr.value) editor.updateTransition(tr.value.id, { cond: cond.value })
}
function commitActions(): void {
  if (tr.value) editor.updateTransition(tr.value.id, { actions: lines(actions.value) })
}
function commitDelay(): void {
  if (!tr.value) return
  if (delayOn.value) {
    editor.updateTransition(tr.value.id, {
      delayMs: Math.max(10, Number(delayMs.value) || 10),
      delayUnit: delayUnit.value,
    })
  } else {
    editor.updateTransition(tr.value.id, {
      delayMs: undefined,
      delayUnit: undefined,
      ...(isAutoDelayEvent(tr.value.event) ? { event: '' } : {}),
    })
  }
}
function setRootInitial(e: Event): void {
  editor.setDocMeta({ initial: (e.target as HTMLSelectElement).value || null })
}
</script>

<template>
  <div class="sce-panel sce-properties">
    <template v-if="st">
      <div class="sce-panel-head">
        <h3>{{ editor.labels.properties }} · {{ editor.labels.states }}</h3>
        <button class="sce-icon-btn" :disabled="editor.locked" @click="editor.deleteState(st.uid)">×</button>
      </div>

      <div class="sce-field">
        <label>{{ editor.labels.stateId }}</label>
        <input v-model="id" :disabled="editor.locked" @change="commitId" />
        <p v-if="idErr" class="sce-error">{{ idErr }}</p>
      </div>
      <div class="sce-field">
        <label>{{ editor.labels.stateLabel }}</label>
        <input v-model="label" :disabled="editor.locked" @change="commitLabel" />
      </div>
      <div class="sce-field">
        <label>{{ editor.labels.kind }}</label>
        <select v-model="kind" :disabled="editor.locked" @change="commitKind">
          <option value="atomic">atomic</option>
          <option value="compound">compound</option>
          <option value="parallel">parallel</option>
          <option value="final">final</option>
          <option value="history">history</option>
        </select>
      </div>
      <div class="sce-field">
        <label>{{ editor.labels.parent }}</label>
        <select v-model="parent" :disabled="editor.locked" @change="commitParent">
          <option value="">{{ editor.labels.none }}</option>
          <option v-for="p in parentOptions" :key="p.uid" :value="p.uid">{{ p.label || p.id }}</option>
        </select>
      </div>
      <div v-if="kind === 'compound'" class="sce-field">
        <label>{{ editor.labels.initial }}</label>
        <select v-model="initial" :disabled="editor.locked" @change="commitInitial">
          <option value="">{{ editor.labels.none }}</option>
          <option v-for="k in initialKids" :key="k.uid" :value="k.uid">{{ k.label || k.id }}</option>
        </select>
      </div>
      <div v-if="kind === 'history'" class="sce-field">
        <label>{{ editor.labels.historyType }}</label>
        <select v-model="historyType" :disabled="editor.locked" @change="commitHistoryType">
          <option value="shallow">{{ editor.labels.shallow }}</option>
          <option value="deep">{{ editor.labels.deep }}</option>
        </select>
      </div>

      <div class="sce-field">
        <label>{{ editor.labels.entryActions }}</label>
        <textarea v-model="entry" :disabled="editor.locked" :placeholder="editor.labels.actionsHint" @change="commitEntry" />
      </div>
      <div class="sce-field">
        <label>{{ editor.labels.exitActions }}</label>
        <textarea v-model="exit" :disabled="editor.locked" :placeholder="editor.labels.actionsHint" @change="commitExit" />
      </div>
    </template>

    <template v-else-if="tr">
      <div class="sce-panel-head">
        <h3>{{ editor.labels.properties }} · {{ editor.labels.transitions }}</h3>
        <button class="sce-icon-btn" :disabled="editor.locked" @click="editor.deleteTransition(tr.id)">×</button>
      </div>
      <p class="sce-meta">
        {{ editor.stateName(tr.source) }} → {{ editor.stateName(tr.target) }}
      </p>
      <div class="sce-field">
        <label>{{ editor.labels.event }}</label>
        <input v-model="event" :list="datalistId" :disabled="editor.locked || tr.delayMs !== undefined" @change="commitEvent" />
        <datalist :id="datalistId">
          <option v-for="name in eventNames" :key="name" :value="name" />
        </datalist>
        <p v-if="eventErr" class="sce-error">{{ eventErr }}</p>
      </div>
      <div class="sce-field">
        <label>{{ editor.labels.cond }}</label>
        <input v-model="cond" :disabled="editor.locked" @change="commitCond" />
      </div>
      <div class="sce-field">
        <label>
          <input v-model="delayOn" type="checkbox" :disabled="editor.locked" @change="commitDelay" />
          {{ editor.labels.delay }}
        </label>
        <div v-if="delayOn" class="sce-inline">
          <input v-model.number="delayMs" class="sce-num" type="number" min="10" step="10" :disabled="editor.locked" @change="commitDelay" />
          <select v-model="delayUnit" :disabled="editor.locked" @change="commitDelay">
            <option value="s">{{ editor.labels.sequence }}</option>
            <option value="ms">{{ editor.labels.milliseconds }}</option>
          </select>
        </div>
      </div>
      <div class="sce-field">
        <label>{{ editor.labels.entryActions }}</label>
        <textarea v-model="actions" :disabled="editor.locked" :placeholder="editor.labels.actionsHint" @change="commitActions" />
      </div>
    </template>

    <template v-else>
      <div class="sce-panel-head"><h3>{{ editor.labels.properties }}</h3></div>
      <div class="sce-field">
        <label>{{ editor.labels.projectName }}</label>
        <input :value="editor.doc.name" :disabled="editor.readOnly" @change="editor.setDocMeta({ name: ($event.target as HTMLInputElement).value })" />
      </div>
      <div class="sce-field">
        <label>{{ editor.labels.rootInitial }}</label>
        <select :value="editor.doc.initial ?? ''" :disabled="editor.readOnly" @change="setRootInitial">
          <option value="">{{ editor.labels.none }}</option>
          <option v-for="s in editor.topStates" :key="s.uid" :value="s.uid">{{ s.label || s.id }}</option>
        </select>
      </div>
      <p class="sce-meta">选中左侧状态或转移后编辑属性。</p>
    </template>
  </div>
</template>
