<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useEditor } from './use-editor'

const editor = useEditor()

function onKey(e: KeyboardEvent): void {
  if (!editor.confirmRequest) return
  if (e.key === 'Escape') {
    e.preventDefault()
    editor.respondConfirm(false)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    editor.respondConfirm(true)
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="editor.confirmRequest" class="sce-overlay" @click.self="editor.respondConfirm(false)">
    <div class="sce-dialog" role="alertdialog">
      <h3>{{ editor.confirmRequest.title }}</h3>
      <p class="sce-msg">{{ editor.confirmRequest.message }}</p>
      <div class="sce-dialog-btns">
        <button @click="editor.respondConfirm(false)">{{ editor.labels.cancel }}</button>
        <button
          :class="editor.confirmRequest.tone === 'primary' ? 'sce-primary' : 'sce-danger'"
          @click="editor.respondConfirm(true)"
        >{{ editor.confirmRequest.confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>
