<script setup lang="ts">
/**
 * 画布：官方 `<scxml-view>` 的薄宿主。
 * - 编辑态：把序列化后的 SCXML 写入 `source`（250ms 防抖）；
 * - 仿真态：把 SessionRunner 的会话挂到 `session` DOM property；
 * - 点击选中/缩放平移等官方契约细节留给宿主增强（P4 从 donor 迁回）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import '@tinyactors/scxmljs/view'
import { serializeToScxml } from '../core/serializer'
import { useEditor } from './use-editor'

const editor = useEditor()
const el = ref<HTMLElement & { source?: string; session?: unknown } | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

function pushSource(): void {
  if (!el.value || editor.sim.running) return
  el.value.source = serializeToScxml(editor.doc)
}

function schedulePush(): void {
  if (editor.sim.running) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(pushSource, 250)
}

watch(() => editor.doc, schedulePush, { deep: true })
watch(
  () => editor.sim.running,
  (running) => {
    if (!el.value) return
    if (running) el.value.session = editor.runner.sessionOrNull ?? undefined
    else {
      el.value.session = undefined
      pushSource()
    }
  },
)

onMounted(pushSource)
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="sce-canvas">
    <scxml-view ref="el" class="sce-view" autostart="false"></scxml-view>
    <div v-if="!editor.doc.states.length" class="sce-canvas-empty">
      <p>{{ editor.labels.emptyDoc }}</p>
      <p class="sce-sub">{{ editor.labels.emptyHint }}</p>
    </div>
    <div v-if="editor.readOnly" class="sce-canvas-badge">{{ editor.labels.readOnly }}</div>
  </div>
</template>
