<script setup lang="ts">
/**
 * 事件面板（P4.3）。
 *
 * 按方向分组，避免把“广播”这种发送侧属性挂到接收事件上：
 * - 发送事件：send 动作（含显式延迟发送），可编辑宿主注册的事件字段
 * - 接收事件：转移监听，只读展示来源
 * - 内部延时事件：由延时触发转移自动生成，只在本机内部收发，只读
 *
 * kit 只读写 ProjectDoc.eventAttrs；字段语义由宿主模块解释。
 */
import { computed } from 'vue'
import { useEditor } from './use-editor'
import { parseActionLine } from '../core/action-parse'
import { docEventFacts } from '../core/event-catalog'
import { isAutoDelayEvent } from '../core/naming'
import type { EventVisibility, MetaAttrs, MetaValue } from '../core/model'
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

function collectSends(): Set<string> {
  const names = new Set<string>()
  const scan = (actions: string[]): void => {
    for (const line of actions) {
      const a = parseActionLine(line)
      if (a.type === 'send' && a.event.trim() && !isAutoDelayEvent(a.event.trim())) {
        names.add(a.event.trim())
      }
    }
  }
  for (const s of editor.doc.states) scan([...s.entryActions, ...s.exitActions])
  for (const t of editor.doc.transitions) scan(t.actions)
  return names
}

function collectListens(): Set<string> {
  const names = new Set<string>()
  for (const t of editor.doc.transitions) {
    for (const name of t.event.split(/\s+/)) {
      if (name && !isAutoDelayEvent(name)) names.add(name)
    }
  }
  return names
}

const sendRows = computed(() => [...collectSends()].sort((a, b) => a.localeCompare(b)))
const facts = computed(() => docEventFacts(editor.doc))
const externalNames = computed(() => new Set(editor.state.externalEvents.map((e) => e.value)))
const receiveRows = computed(() =>
  [...collectListens()]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const origins = facts.value.sendOrigins.get(name) ?? []
      const sources: string[] = []
      if (origins.some((o) => o.channel === 'internal')) sources.push(editor.labels.eventSourceInternal)
      if (origins.some((o) => o.channel === 'external')) sources.push(editor.labels.eventSourceSend)
      if (origins.some((o) => o.channel === 'auto-delay')) sources.push(editor.labels.eventSourceAutoDelay)
      if (externalNames.value.has(name)) sources.push(editor.labels.eventSourceExternal)
      if (!sources.length) sources.push(editor.labels.eventSourceListenOnly)
      return {
        name,
        sources,
        visibility: (editor.doc.eventVisibility?.[name] === 'internal' ? 'internal' : 'both') as EventVisibility,
      }
    }),
)

function setVisibility(name: string, e: Event): void {
  editor.setEventVisibility(name, (e.target as HTMLSelectElement).value as EventVisibility)
}

function delayLabel(ms: number | undefined, unit: 's' | 'ms' | undefined): string {
  const v = ms ?? 0
  return unit === 's' && v % 1000 === 0 ? `${v / 1000}s` : `${v}ms`
}

const internalRows = computed(() =>
  editor.doc.transitions
    .filter((t) => t.delayMs !== undefined)
    .map((t) => ({
      id: t.id,
      event: t.event,
      delay: delayLabel(t.delayMs, t.delayUnit),
      source: editor.stateName(t.source),
      target: editor.stateName(t.target),
    })),
)

const hasAny = computed(() => sendRows.value.length > 0 || receiveRows.value.length > 0 || internalRows.value.length > 0)
</script>

<template>
  <div class="sce-panel sce-events">
    <div class="sce-panel-head">
      <h3>{{ editor.labels.events }}</h3>
    </div>
    <p class="sce-meta">
      发送事件可配置宿主字段；接收事件只读；内部延时事件仅在本机内部收发。
    </p>
    <p v-if="!hasAny" class="sce-empty">
      还没有事件：先给转移或 send 动作设置事件名。
    </p>

    <section v-if="sendRows.length" class="sce-event-section">
      <h4>{{ editor.labels.sendEvents }} <span class="sce-count">{{ sendRows.length }}</span></h4>
      <table class="sce-attr-table">
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
          <tr v-for="name in sendRows" :key="name">
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
    </section>

    <section v-if="receiveRows.length" class="sce-event-section">
      <h4>{{ editor.labels.receiveEvents }} <span class="sce-count">{{ receiveRows.length }}</span></h4>
      <table class="sce-attr-table">
        <thead>
          <tr>
            <th>{{ editor.labels.event }}</th>
            <th>{{ editor.labels.eventSource }}</th>
            <th>{{ editor.labels.eventVisibility }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in receiveRows" :key="row.name">
            <td class="name" :title="row.name">{{ row.name }}</td>
            <td class="source">{{ row.sources.join(' · ') }}</td>
            <td class="visibility">
              <select
                :value="row.visibility"
                :disabled="editor.locked"
                :aria-label="`${row.name} ${editor.labels.eventVisibility}`"
                @change="setVisibility(row.name, $event)"
              >
                <option value="both">{{ editor.labels.visibilityBoth }}</option>
                <option value="internal">{{ editor.labels.visibilityInternal }}</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <details v-if="internalRows.length" class="sce-internal-events">
      <summary>
        {{ editor.labels.internalEvents }} <span class="sce-count">{{ internalRows.length }}</span>
      </summary>
      <p class="sce-meta">{{ editor.labels.internalEventHint }}</p>
      <div v-for="row in internalRows" :key="row.id" class="sce-internal-row">
        <span class="delay">⏱ {{ row.delay }}</span>
        <span class="target">{{ row.source }} → {{ row.target }}</span>
        <span class="raw" :title="row.event">{{ row.event }}</span>
        <button class="mini" @click="editor.select('transition', row.id)">{{ editor.labels.locate }}</button>
      </div>
    </details>
  </div>
</template>
