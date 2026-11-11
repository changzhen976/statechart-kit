<script setup lang="ts">
/**
 * 变量面板。
 *
 * 变量行 = 名字 + 初始值 + 宿主注册的属性字段（如 creator 的“全局”）。
 * 事件属性在独立的 EventAttrsPanel；kit 不解释字段语义。
 */
import { ref } from 'vue'
import { useEditor } from './use-editor'
import type { MetaAttrs, MetaValue } from '../core/model'
import type { EditorAttributeField } from './modules'

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

function fieldValue(attrs: MetaAttrs | undefined, field: EditorAttributeField): MetaValue {
  return attrs?.[field.key] ?? field.defaultValue ?? (field.type === 'boolean' ? false : '')
}

function readField(field: EditorAttributeField, e: Event): MetaValue {
  const el = e.target as HTMLInputElement | HTMLSelectElement
  if (field.type === 'boolean') return (el as HTMLInputElement).checked
  if (field.type === 'number') return Number(el.value) || 0
  return el.value
}

function setVarField(index: number, field: EditorAttributeField, e: Event): void {
  editor.setVariableAttr(index, field.key, readField(field, e))
}
</script>

<template>
  <div class="sce-panel sce-variables">
    <div class="sce-panel-head">
      <h3>{{ editor.labels.variables }}</h3>
      <button :disabled="editor.locked" @click="editor.addVariable()">{{ editor.labels.addVariable }}</button>
    </div>
    <p class="sce-meta">
      变量属性由宿主模块定义；序列化为
      <code>&lt;data id expr data-kit-attrs/&gt;</code>。
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
      <template v-for="field in editor.variableFields" :key="field.id">
        <label v-if="field.type === 'boolean'" class="sce-var-flag" :title="field.title">
          <input
            type="checkbox"
            :checked="fieldValue(d.attrs, field) === true"
            :disabled="editor.locked"
            @change="setVarField(i, field, $event)"
          />
          {{ field.label }}
        </label>
        <select
          v-else-if="field.type === 'select'"
          class="sce-var-select"
          :value="String(fieldValue(d.attrs, field))"
          :disabled="editor.locked"
          :title="field.title"
          @change="setVarField(i, field, $event)"
        >
          <option v-for="opt in field.options ?? []" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <input
          v-else
          class="sce-var-attr"
          :type="field.type === 'number' ? 'number' : 'text'"
          :value="String(fieldValue(d.attrs, field))"
          :disabled="editor.locked"
          :title="field.title"
          :placeholder="field.label"
          @change="setVarField(i, field, $event)"
        />
      </template>
      <button class="sce-icon-btn" :disabled="editor.locked" @click="editor.removeVariable(i)">×</button>
    </div>

  </div>
</template>
