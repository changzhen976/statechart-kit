<script setup lang="ts">
/**
 * 事件名输入 + 候选下拉（方向目录：↓送入本机 / ↑本机发出 / ·仅监听）。
 *
 * - 仍允许手输任意事件名（SCXML 事件不要求来自现有列表）；
 * - 候选按方向分组显示，行尾小字标注来源（时钟 @Nms / 路由 / MQTT / 广播）；
 *   同名事件双向都有时在两组各一行——重复即含义；
 * - 输入过程中只发 update:modelValue，失焦/回车/选中时才发 change，
 *   便于 ActionListEditor 这类“change 才重建行”的调用方使用。
 */
import { computed, ref, watch } from 'vue'
import { useEditor } from './use-editor'
import type { EditorEventGroup, EditorEventOption } from './events'

const editor = useEditor()

const props = defineProps<{
  modelValue: string
  options?: EditorEventOption[]
  disabled?: boolean
  placeholder?: string
  title?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'change', v: string): void
}>()

const text = ref(props.modelValue)
const focusValue = ref(props.modelValue)
const openDd = ref(false)
watch(
  () => props.modelValue,
  (v) => {
    text.value = v
  },
)

const groupLabels = computed<Record<EditorEventGroup, string>>(() => ({
  in: editor.labels.eventGroupIn,
  out: editor.labels.eventGroupOut,
  lone: editor.labels.eventGroupLone,
}))

const groups = computed(() => {
  const map = new Map<string, EditorEventOption[]>()
  for (const opt of props.options ?? []) {
    if (!opt.value) continue
    const list = map.get(opt.group) ?? []
    if (!list.some((x) => x.value === opt.value)) list.push(opt)
    map.set(opt.group, list)
  }
  return [...map.entries()]
})
const hasOptions = computed(() => groups.value.length > 0)

function onInput(e: Event): void {
  text.value = (e.target as HTMLInputElement).value
  emit('update:modelValue', text.value)
}

function commit(): void {
  const v = text.value.trim()
  if (v !== props.modelValue) emit('update:modelValue', v)
  emit('change', v)
  openDd.value = false
}

function commitAndBlur(e: KeyboardEvent): void {
  commit()
  ;(e.target as HTMLInputElement).blur()
}

function onEscape(): void {
  text.value = focusValue.value
  emit('update:modelValue', text.value)
  emit('change', text.value)
  openDd.value = false
}

function pick(value: string): void {
  text.value = value
  emit('update:modelValue', value)
  emit('change', value)
  openDd.value = false
}
</script>

<template>
  <div class="event-combo">
    <input
      :value="text"
      :disabled="disabled"
      :placeholder="placeholder ?? editor.labels.eventNamePlaceholder"
      :title="title ?? editor.labels.eventNameTitle"
      spellcheck="false"
      @input="onInput"
      @focus="focusValue = text"
      @blur="commit"
      @keydown.enter.prevent="commitAndBlur"
      @keydown.esc.prevent="onEscape"
    />
    <button
      v-if="!disabled && hasOptions"
      class="dd-btn"
      type="button"
      tabindex="-1"
      :title="editor.labels.eventPick"
      @mousedown.prevent="openDd = !openDd"
    >▼</button>
    <div v-if="openDd && hasOptions" class="dd-list">
      <template v-for="[group, list] in groups" :key="group">
        <div class="dd-group">{{ groupLabels[group as EditorEventGroup] ?? group }}</div>
        <div
          v-for="opt in list"
          :key="opt.value"
          class="dd-opt"
          :title="opt.tip"
          @mousedown.prevent="pick(opt.value)"
        >{{ opt.value }}<span v-if="opt.tag" class="dd-tag">{{ opt.tag }}</span></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.event-combo {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}
.event-combo input {
  flex: 1;
  min-width: 0;
  font: 12px var(--scxml-font-mono);
  color: var(--scxml-fg);
  background: var(--scxml-bg);
  border: 1px solid var(--scxml-border-2);
  border-radius: 4px;
  padding: 3px 6px;
}
.event-combo input::placeholder {
  color: var(--scxml-fg-faint);
}
.dd-btn {
  flex: none;
  font-size: 9px;
  line-height: 1;
  color: var(--scxml-fg-muted);
  background: var(--scxml-surface-2);
  border: 1px solid var(--scxml-border-2);
  border-radius: 4px;
  padding: 4px 3px;
  cursor: pointer;
}
.dd-btn:hover {
  color: var(--scxml-accent);
  border-color: var(--scxml-accent);
}
.dd-list {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  min-width: 100%;
  background: var(--scxml-surface);
  border: 1px solid var(--scxml-border-2);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  max-height: 180px;
  overflow-y: auto;
  z-index: 60;
}
.dd-group {
  padding: 4px 8px 2px;
  font: 600 10px var(--scxml-font-sans);
  color: var(--scxml-fg-subtle);
  background: var(--scxml-surface-2);
}
.dd-opt {
  padding: 4px 8px;
  font: 12px var(--scxml-font-mono);
  color: var(--scxml-fg);
  cursor: pointer;
  white-space: nowrap;
}
.dd-opt:hover {
  background: var(--scxml-accent-subtle);
  color: var(--scxml-accent-text);
}
.dd-tag {
  margin-left: 6px;
  font: 10px var(--scxml-font-sans);
  /* 继承行文字颜色（悬停变蓝时同步），降不透明度弱化，避免固定灰字在蓝底上不可读 */
  color: inherit;
  opacity: 0.72;
}
</style>
