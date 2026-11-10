<script setup lang="ts">
import { computed, ref } from 'vue'
import { EXAMPLES } from '../core/examples'
import { useEditor } from './use-editor'
import type { EditorToolbarContribution } from './modules'

const editor = useEditor()
const example = ref('')

const examples = computed(() => editor.adapter.examples ?? EXAMPLES)
const stateText = computed(() => {
  if (editor.saving) return editor.labels.saving
  if (editor.dirty) return editor.labels.dirty
  return editor.labels.saved
})

async function guardDirty(): Promise<boolean> {
  if (!editor.dirty) return true
  return editor.confirm({
    title: editor.labels.save,
    message: '当前文档有未保存更改，继续将丢失这些更改。',
    confirmLabel: editor.labels.confirm,
  })
}

async function onNew(): Promise<void> {
  if (await guardDirty()) await editor.newDoc()
}
async function onOpen(): Promise<void> {
  if (await guardDirty()) await editor.openProject()
}
async function onExample(): Promise<void> {
  const ex = examples.value.find((e) => e.name === example.value)
  if (!ex) return
  if (await guardDirty()) await editor.loadDoc(ex.make())
  example.value = ''
}
function onNameChange(e: Event): void {
  editor.setDocMeta({ name: (e.target as HTMLInputElement).value })
}
function onExit(): void {
  editor.exit()
}
async function onDeploy(): Promise<void> {
  await editor.deploy()
}

function moduleDisabled(c: EditorToolbarContribution): boolean {
  if (!c.disabled) return false
  try {
    return c.disabled(editor)
  } catch {
    return true
  }
}
async function runModule(c: EditorToolbarContribution): Promise<void> {
  try {
    await c.run(editor)
  } catch (err) {
    editor.pushLog('error', `模块命令「${c.label}」失败：${err instanceof Error ? err.message : String(err)}`)
  }
}
</script>

<template>
  <header class="sce-toolbar">
    <div class="sce-brand">
      <span class="sce-brand-name">{{ editor.labels.appTitle }}</span>
      <input
        class="sce-project-name"
        :value="editor.doc.name"
        :title="editor.labels.projectName"
        @change="onNameChange"
      />
      <span class="sce-save-state" :class="{ dirty: editor.dirty }">{{ stateText }}</span>
    </div>

    <div v-if="editor.features.undoRedo" class="sce-group">
      <button :disabled="!editor.canUndo" @click="editor.undo()">{{ editor.labels.undo }}</button>
      <button :disabled="!editor.canRedo" @click="editor.redo()">{{ editor.labels.redo }}</button>
    </div>

    <div v-if="editor.features.importExport" class="sce-group">
      <button @click="onNew">{{ editor.labels.newDoc }}</button>
      <button @click="onOpen">{{ editor.labels.open }}</button>
      <button @click="editor.saveProject()">{{ editor.labels.save }}</button>
    </div>

    <div v-if="editor.features.examples && examples.length" class="sce-group">
      <select v-model="example" class="sce-select" @change="onExample">
        <option value="" disabled>{{ editor.labels.openExample }}</option>
        <option v-for="e in examples" :key="e.name" :value="e.name">{{ e.name }}</option>
      </select>
    </div>

    <div v-if="editor.features.validation || editor.features.simulation" class="sce-group">
      <button v-if="editor.features.validation" @click="editor.validate()">{{ editor.labels.validate }}</button>
      <button
        v-if="editor.features.simulation && !editor.sim.running"
        class="sce-primary"
        @click="editor.run()"
      >{{ editor.labels.run }}</button>
      <button
        v-else-if="editor.features.simulation"
        class="sce-danger"
        @click="editor.stopSim()"
      >{{ editor.labels.stop }}</button>
    </div>

    <div v-if="editor.features.importExport" class="sce-group">
      <button @click="editor.exportScxml()">{{ editor.labels.exportScxml }}</button>
    </div>

    <div v-if="editor.moduleToolbar.length" class="sce-group sce-module-actions">
      <button
        v-for="c in editor.moduleToolbar"
        :key="c.id"
        :class="{ 'sce-primary': c.tone === 'primary', 'sce-danger': c.tone === 'danger' }"
        :title="c.title ?? c.label"
        :disabled="moduleDisabled(c)"
        @click="runModule(c)"
      >{{ c.label }}</button>
    </div>

    <div class="sce-spacer" />

    <span v-if="editor.readOnly" class="sce-badge">{{ editor.labels.readOnly }}</span>
    <button
      v-if="editor.features.deploy && editor.adapter.deploy"
      class="sce-primary"
      :disabled="editor.deploying || !editor.canDeploy"
      @click="onDeploy"
    >{{ editor.deploying ? editor.labels.deploying : editor.labels.deploy }}</button>
    <button v-if="editor.features.exit && editor.adapter.exit" class="sce-exit" @click="onExit">
      {{ editor.labels.exit }}
    </button>
  </header>
</template>
