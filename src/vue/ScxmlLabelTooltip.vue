<script setup lang="ts">
/**
 * 转移标签完整条件 tooltip 的 Vue 包装。
 *
 * 交互与定位在 label-tooltip.ts（纯 DOM，可单测）；本组件只负责把 view/doc/
 * enabled 同步给 controller，并在卸载时清理。
 *
 * 用法：
 *   <ScxmlLabelTooltip :view="viewEl" :doc="doc" :enabled="tooltipEnabled" />
 */
import { onBeforeUnmount, watch } from 'vue'
import {
  createLabelTooltip,
  type LabelTooltipController,
  type LabelTooltipProps,
} from './label-tooltip'

const props = defineProps<LabelTooltipProps>()

let control: LabelTooltipController | null = null

function sync(): void {
  control?.destroy()
  control = null
  if (!props.view) return
  control = createLabelTooltip(props.view, {
    getDoc: () => props.doc,
    enabled: () => props.enabled !== false,
    passive: props.passive === true,
    get formatter() {
      return props.formatter
    },
  })
}

watch([() => props.view, () => props.enabled, () => props.passive], sync, { immediate: true })

watch(
  () => props.doc,
  () => control?.update(),
)

onBeforeUnmount(() => {
  control?.destroy()
  control = null
})
</script>

<template>
  <span class="sce-label-tooltip-anchor" hidden aria-hidden="true"></span>
</template>
