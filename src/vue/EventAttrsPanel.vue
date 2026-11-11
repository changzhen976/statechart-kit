<script setup lang="ts">
/**
 * 事件属性面板（从变量页拆出）。
 *
 * 事件名来自转移监听 + send 动作 + 已保存的 eventAttrs；字段由宿主模块注册
 * （如 creator 的“广播”）。kit 只读写 ProjectDoc.eventAttrs，不解释字段语义。
 */
import { computed } from 'vue'
import { useEditor } from './use-editor'
import { parseActionLine } from '../core/action-parse'
import type { MetaAttrs, MetaValue } from '../core/model'
import type { EditorAttributeField } from './modules'

const editor = useEditor()

function fieldValue(attrs: MetaAttrs | undefined, field: EditorAttributeField): MetaValue {
  return attrs?.[field.key] ?? field.defaultValue ?? (field.type === 'boolean' ? false : '')
}

function readField(field: EditorAttributeField, e: Event): MetaValue {
  const el = e.target as HTMLInputElement | HTMLSelectElement
  if (field.type === 'boolean') return (el as HTMLInputElement).checked
  if (field.type === 'number') return Number(el.value) || 0
  return el.value
}

function setEventField(name: string, field: EditorAttributeField, e: Event): void {
  editor.setEventAttr(name, field.key, readField(field, e))
}

/** 文档中实际出现的事件（转移监听 + send 动作 + 已有属性） */
const eventNames = computed(() => {
  const names = new Set<string>()
  for (const t of editor.doc.transitions) {
    if (t.event.trim()) names.add(t.event.trim())
    for (const line of t.actions) {
      const a = parseActionLine(line)
      if (a.type === 'send' && a.event.trim()) names.add(a.event.trim())
    }
  }
  for (const s of editor.doc.states) {
    for (const line of [...s.entryActions, ...s.exitActions]) {
      const a = parseActionLine(line)
      if (a.type === 'send' && a.event.trim()) names.add(a.event.trim())
    }
  }
  for (const name of Object.keys(editor.doc.eventAttrs ?? {})) names.add(name)
  return [...names].sort((a, b) => a.localeCompare(b))
})
</script>

<template>
  <div class="sce-panel sce-events">
    <div class="sce-panel-head">
      <h3>{{ editor.labels.events }}</h3>
    </div>
    <p class="sce-meta">
      事件属性作用于“事件名”，不改变转移/动作本身；由宿主模块定义语义。
    </p>
    <p v-if="!eventNames.length" class="sce-empty">
      还没有事件：先给转移或 send 动作设置事件名。
    </p>
    <table v-else class="sce-attr-table">
      <thead>
        <tr>
          <th>{{ editor.labels.event }}</th>
          <th
            v-for="field in editor.eventFields"
            :key="field.id"
            class="field"
            :title="field.title"
          >{{ field.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="name in eventNames" :key="name">
          <td class="name" :title="name">{{ name }}</td>
          <td v-for="field in editor.eventFields" :key="field.id" class="field">
            <label v-if="field.type === 'boolean'" class="sce-var-flag" :title="field.title">
              <input
                type="checkbox"
                :checked="fieldValue(editor.doc.eventAttrs?.[name], field) === true"
                :disabled="editor.locked"
                :aria-label="`${name} ${field.label}`"
                @change="setEventField(name, field, $event)"
              />
            </label>
            <select
              v-else-if="field.type === 'select'"
              class="sce-var-select"
              :value="String(fieldValue(editor.doc.eventAttrs?.[name], field))"
              :disabled="editor.locked"
              :title="field.title"
              @change="setEventField(name, field, $event)"
            >
              <option v-for="opt in field.options ?? []" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <input
              v-else
              class="sce-var-attr"
              :type="field.type === 'number' ? 'number' : 'text'"
              :value="String(fieldValue(editor.doc.eventAttrs?.[name], field))"
              :disabled="editor.locked"
              :title="field.title"
              :placeholder="field.label"
              @change="setEventField(name, field, $event)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
