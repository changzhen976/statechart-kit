<script setup lang="ts">
/**
 * 编辑器根组件（P3）。
 *
 * 只负责布局与标签页选择；文档/会话/宿主能力都在 `createEditor()` 的 store 里。
 * 所有子组件通过 `useEditor()` 注入，宿主可单独使用 `mountEditor()` 或自行
 * `createApp(EditorHost, { editor })`。
 */
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import type { EditorStore } from './editor-store'
import { EDITOR_KEY } from './use-editor'
import Toolbar from './Toolbar.vue'
import StructurePanel from './StructurePanel.vue'
import ChartCanvas from './ChartCanvas.vue'
import PropertyPanel from './PropertyPanel.vue'
import VariablesPanel from './VariablesPanel.vue'
import EventAttrsPanel from './EventAttrsPanel.vue'
import SimPanel from './SimPanel.vue'
import SimBar from './SimBar.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import ValidationDialog from './ValidationDialog.vue'

const props = defineProps<{ editor: EditorStore }>()
const editor = props.editor
// 宿主直接使用 <EditorHost :editor> 时也要让模块组件能 inject
provide(EDITOR_KEY, editor)

type Tab = string
const moduleTabs = computed(() =>
  editor.moduleTabs.filter((t) => {
    if (!t.visible) return true
    try {
      return t.visible(editor)
    } catch {
      return true
    }
  }),
)
const showEvents = computed(() => editor.features.events)
const initialTab: Tab = editor.features.properties
  ? 'props'
  : editor.features.variables
    ? 'vars'
    : showEvents.value
      ? 'events'
      : editor.features.simulation
        ? 'sim'
        : (moduleTabs.value[0]?.id ?? 'props')
const tab = ref<Tab>(initialTab)
const activeModule = computed(() => moduleTabs.value.find((t) => t.id === tab.value) ?? null)

const showRight = computed(
  () =>
    editor.features.properties ||
    editor.features.variables ||
    showEvents.value ||
    editor.features.simulation ||
    moduleTabs.value.length > 0,
)

const root = ref<HTMLElement | null>(null)

/** 编辑器内快捷键：只在本组件子树内生效，避免抢宿主页面的 Ctrl+Z。 */
function onKeydown(e: KeyboardEvent): void {
  const el = root.value
  if (!el) return
  const active = document.activeElement
  if (!active || !el.contains(active)) return
  const target = active as HTMLElement
  const typing =
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  if (typing || editor.readOnly) return
  const mod = e.ctrlKey || e.metaKey
  if (mod && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
    e.preventDefault()
    if (e.key === 'y' || e.key === 'Y' || e.key === 'Z' || e.shiftKey) editor.redo()
    else editor.undo()
    return
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !editor.sim.running && editor.selection.id) {
    e.preventDefault()
    void editor.deleteSelection()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div ref="root" class="sce-root">
    <Toolbar v-if="editor.features.toolbar" />

    <div class="sce-main">
      <aside v-if="editor.features.structure" class="sce-side sce-side-left">
        <StructurePanel />
      </aside>

      <ChartCanvas v-if="editor.features.canvas" class="sce-center" />
      <div v-else class="sce-center sce-center-empty" />

      <aside v-if="showRight" class="sce-side sce-side-right">
        <nav class="sce-tabs" role="tablist">
          <button
            v-if="editor.features.properties"
            :class="{ on: tab === 'props' }"
            role="tab"
            :aria-selected="tab === 'props'"
            @click="tab = 'props'"
          >{{ editor.labels.properties }}</button>
          <button
            v-if="editor.features.variables"
            :class="{ on: tab === 'vars' }"
            role="tab"
            :aria-selected="tab === 'vars'"
            @click="tab = 'vars'"
          >{{ editor.labels.variables }}</button>
          <button
            v-if="showEvents"
            :class="{ on: tab === 'events' }"
            role="tab"
            :aria-selected="tab === 'events'"
            @click="tab = 'events'"
          >{{ editor.labels.events }}</button>
          <button
            v-if="editor.features.simulation"
            :class="{ on: tab === 'sim' }"
            role="tab"
            :aria-selected="tab === 'sim'"
            @click="tab = 'sim'"
          >{{ editor.labels.simulation }}</button>
          <button
            v-for="t in moduleTabs"
            :key="t.id"
            :class="{ on: tab === t.id, 'sce-tab-module': true }"
            role="tab"
            :aria-selected="tab === t.id"
            :title="t.title"
            @click="tab = t.id"
          >{{ t.title }}</button>
        </nav>
        <div class="sce-tab-body">
          <PropertyPanel v-if="editor.features.properties" v-show="tab === 'props'" />
          <VariablesPanel v-if="editor.features.variables" v-show="tab === 'vars'" />
          <EventAttrsPanel v-if="showEvents" v-show="tab === 'events'" />
          <SimPanel v-if="editor.features.simulation" v-show="tab === 'sim'" />
          <component
            :is="activeModule.component"
            v-if="activeModule"
          />
        </div>
      </aside>
    </div>

    <SimBar v-if="editor.features.simBar" />

    <ConfirmDialog />
    <ValidationDialog v-if="editor.features.validation" />
  </div>
</template>
