<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditor } from './use-editor'
import { formatVariableResult } from './format'

const editor = useEditor()
const customName = ref('')
const customData = ref('')
const dataErr = ref('')
const setVarId = ref('')
const setVarExpr = ref('')
const setErr = ref('')

const logs = computed(() => editor.sim.log.slice(-120).reverse())
const events = computed(() => editor.knownEvents)

function sendCustom(): void {
  dataErr.value = ''
  const name = customName.value.trim()
  if (!name) {
    dataErr.value = '填写事件名'
    return
  }
  let data: unknown = undefined
  const raw = customData.value.trim()
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      dataErr.value = '数据不是合法 JSON'
      return
    }
  }
  editor.sendEvent(name, data)
}

function assign(): void {
  setErr.value = ''
  if (!setVarId.value) {
    setErr.value = '先选择变量'
    return
  }
  const expr = setVarExpr.value.trim()
  if (!expr) {
    setErr.value = '填写 JS 表达式'
    return
  }
  const result = editor.assignVariable(setVarId.value, expr)
  if (!result.ok) setErr.value = formatVariableResult(result)
}
</script>

<template>
  <div class="sce-panel sce-sim">
    <div class="sce-panel-head">
      <h3>{{ editor.labels.simulation }}</h3>
      <div>
        <button v-if="!editor.sim.running" class="sce-primary" @click="editor.run()">{{ editor.labels.run }}</button>
        <button v-else class="sce-danger" @click="editor.stopSim()">{{ editor.labels.stop }}</button>
      </div>
    </div>

    <p v-if="editor.validation" :class="editor.validation.ok ? 'sce-ok' : 'sce-error'">
      {{ editor.validation.ok ? editor.labels.validationPassed : editor.labels.validationFailed }}
    </p>

    <template v-if="editor.sim.running">
      <h4>{{ editor.labels.inject }}</h4>
      <div class="sce-event-chips">
        <button v-for="e in events" :key="e" class="sce-chip" @click="editor.sendEvent(e)">{{ e }}</button>
        <span v-if="!events.length" class="sce-meta">图中还没有带事件名的转移</span>
      </div>
      <div class="sce-inline">
        <input v-model="customName" :placeholder="editor.labels.customEvent" @keyup.enter="sendCustom" />
        <input v-model="customData" :placeholder="editor.labels.dataJson" @keyup.enter="sendCustom" />
        <button @click="sendCustom">{{ editor.labels.send }}</button>
      </div>
      <p v-if="dataErr" class="sce-error">{{ dataErr }}</p>

      <h4>{{ editor.labels.variables }}</h4>
      <div v-if="editor.sim.variables" class="sce-vars">
        <div v-for="(v, k) in editor.sim.variables" :key="k" class="sce-var">
          <span class="sce-var-key">{{ k }}</span>
          <span class="sce-var-value">{{ JSON.stringify(v) }}</span>
        </div>
        <span v-if="!Object.keys(editor.sim.variables).length" class="sce-meta">{{ editor.labels.none }}</span>
      </div>
      <div class="sce-inline">
        <select v-model="setVarId">
          <option value="" disabled>{{ editor.labels.variables }}</option>
          <option v-for="d in editor.doc.datamodel" :key="d.id" :value="d.id">{{ d.id }}</option>
        </select>
        <input v-model="setVarExpr" :placeholder="editor.labels.assignExpr" @keyup.enter="assign" />
        <button @click="assign">{{ editor.labels.assign }}</button>
      </div>
      <p v-if="setErr" class="sce-error">{{ setErr }}</p>
    </template>

    <div class="sce-panel-head">
      <h4>{{ editor.labels.log }}</h4>
      <button @click="editor.clearLog()">{{ editor.labels.clear }}</button>
    </div>
    <div class="sce-log">
      <div v-for="(l, i) in logs" :key="i" class="sce-log-row" :class="l.level ?? 'info'">
        <span class="sce-log-time">{{ new Date(l.time).toLocaleTimeString() }}</span>
        <span class="sce-log-kind">{{ l.kind }}</span>
        <span class="sce-log-text">{{ l.text }}</span>
      </div>
      <p v-if="!logs.length" class="sce-meta">—</p>
    </div>
  </div>
</template>
