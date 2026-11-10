<script setup lang="ts">
import { ref } from 'vue'
import { useEditor } from './use-editor'

const editor = useEditor()
const err = ref('')

function rename(index: number, e: Event): void {
  const input = e.target as HTMLInputElement
  const msg = editor.updateVariable(index, { id: input.value.trim() })
  if (msg) {
    input.value = editor.doc.datamodel[index]!.id
    err.value = `第 ${index + 1} 行：${msg}`
    return
  }
  err.value = ''
}
function reexpr(index: number, e: Event): void {
  err.value = ''
  const msg = editor.updateVariable(index, { expr: (e.target as HTMLInputElement).value })
  if (msg) err.value = msg
}
</script>

<template>
  <div class="sce-panel sce-variables">
    <div class="sce-panel-head">
      <h3>{{ editor.labels.variables }}</h3>
      <button :disabled="editor.locked" @click="editor.addVariable()">{{ editor.labels.addVariable }}</button>
    </div>
    <p class="sce-meta">
      序列化为 <code>&lt;data id expr/&gt;</code>；变量名与命名策略由宿主决定。
    </p>
    <p v-if="err" class="sce-error">{{ err }}</p>
    <p v-if="!editor.doc.datamodel.length" class="sce-empty">{{ editor.labels.noVariables }}</p>
    <div v-for="(d, i) in editor.doc.datamodel" :key="i" class="sce-var-row">
      <input
        class="sce-var-name"
        :value="d.id"
        :disabled="editor.locked"
        :placeholder="editor.labels.variableName"
        @change="rename(i, $event)"
      />
      <span class="sce-eq">=</span>
      <input
        class="sce-var-expr"
        :value="d.expr"
        :disabled="editor.locked"
        :placeholder="editor.labels.variableExpr"
        @change="reexpr(i, $event)"
      />
      <button class="sce-icon-btn" :disabled="editor.locked" @click="editor.removeVariable(i)">×</button>
    </div>
  </div>
</template>
