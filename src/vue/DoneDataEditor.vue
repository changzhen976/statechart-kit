<script setup lang="ts">
/**
 * final 状态的 <donedata> 编辑器。
 *
 * 三种互斥形态：content expr / content 文本 / param 列表。切换形态会清除其他形态的
 * 内容，因此需要确认；导入后的数据也通过同一编辑器修改。
 */
import { computed, ref, watch } from 'vue'
import type { DoneData, DoneDataParam } from '../core/model'
import { useEditor } from './use-editor'

const props = defineProps<{
  modelValue?: DoneData
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: DoneData | undefined): void
}>()

const editor = useEditor()
type Mode = 'none' | 'expr' | 'content' | 'params'

const mode = ref<Mode>('none')
const expr = ref('')
const content = ref('')
const params = ref<DoneDataParam[]>([])

function detectMode(value: DoneData | undefined): Mode {
  if (!value) return 'none'
  if (value.params?.length) return 'params'
  if (value.expr !== undefined) return 'expr'
  if (value.content !== undefined) return 'content'
  return 'none'
}

watch(
  () => props.modelValue,
  (value) => {
    mode.value = detectMode(value)
    expr.value = value?.expr ?? ''
    content.value = value?.content ?? ''
    params.value = value?.params?.map((p) => ({ ...p })) ?? []
  },
  { immediate: true },
)

const hasCurrent = computed(() => {
  if (mode.value === 'expr') return expr.value.trim() !== ''
  if (mode.value === 'content') return content.value !== ''
  if (mode.value === 'params') return params.value.length > 0
  return false
})

function emitValue(): void {
  if (mode.value === 'none') {
    emit('update:modelValue', undefined)
    return
  }
  if (mode.value === 'expr') {
    emit('update:modelValue', { expr: expr.value })
    return
  }
  if (mode.value === 'content') {
    emit('update:modelValue', { content: content.value })
    return
  }
  emit('update:modelValue', { params: params.value.map((p) => ({ ...p })) })
}

async function changeMode(next: Mode): Promise<void> {
  if (next === mode.value) return
  if (hasCurrent.value) {
    const ok = await editor.confirm({
      title: editor.labels.doneData,
      message: editor.labels.doneDataSwitchConfirm,
      confirmLabel: editor.labels.confirm,
    })
    if (!ok) return
  }
  mode.value = next
  if (next === 'params' && !params.value.length) {
    params.value = [{ name: 'result', expr: "'ok'" }]
  }
  emitValue()
}

function addParam(): void {
  const used = new Set(params.value.map((p) => p.name))
  let i = params.value.length + 1
  while (used.has(`p${i}`)) i++
  params.value.push({ name: `p${i}`, expr: '0' })
  emitValue()
}

function removeParam(index: number): void {
  params.value.splice(index, 1)
  emitValue()
}

function onModeChange(event: Event): void {
  void changeMode((event.target as HTMLSelectElement).value as Mode)
}
</script>

<template>
  <div class="dd-editor">
    <select :value="mode" :disabled="disabled" @change="onModeChange">
      <option value="none">{{ editor.labels.doneDataNone }}</option>
      <option value="expr">{{ editor.labels.doneDataExprMode }}</option>
      <option value="content">{{ editor.labels.doneDataContentMode }}</option>
      <option value="params">{{ editor.labels.doneDataParamsMode }}</option>
    </select>

    <input
      v-if="mode === 'expr'"
      v-model="expr"
      :disabled="disabled"
      :placeholder="editor.labels.doneDataExpr"
      @change="emitValue"
    />
    <textarea
      v-else-if="mode === 'content'"
      v-model="content"
      :disabled="disabled"
      :placeholder="editor.labels.doneDataContent"
      @change="emitValue"
    />
    <template v-else-if="mode === 'params'">
      <div v-for="(param, index) in params" :key="index" class="dd-param">
        <input v-model="param.name" :disabled="disabled" :placeholder="editor.labels.doneDataParamName" @change="emitValue" />
        <input v-model="param.expr" :disabled="disabled" :placeholder="editor.labels.doneDataParamExpr" @change="emitValue" />
        <button :disabled="disabled" title="删除参数" @click="removeParam(index)">×</button>
      </div>
      <button :disabled="disabled" @click="addParam">{{ editor.labels.doneDataAddParam }}</button>
    </template>
  </div>
</template>
