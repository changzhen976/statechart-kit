<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useEditor } from './use-editor'

const editor = useEditor()

function canLocate(issue: { stateId?: string; event?: string; transitionId?: string }): boolean {
  return !!(issue.stateId || issue.event || issue.transitionId)
}

function onKey(e: KeyboardEvent): void {
  if (editor.validationDialog && e.key === 'Escape') {
    e.preventDefault()
    editor.closeValidationDialog()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="editor.validationDialog" class="sce-overlay overlay" @click.self="editor.closeValidationDialog()">
    <div class="sce-dialog sce-dialog-wide" role="dialog">
      <h3>{{ editor.validationDialog.title }}</h3>
      <ul class="sce-issues issues">
        <li v-for="(issue, i) in editor.validationDialog.issues" :key="i">
          <span class="sce-issue-kind">{{ issue.kind }}</span>
          <span>{{ editor.diagnostics.formatValidationIssue(issue) }}</span>
          <button v-if="canLocate(issue)" class="mini" @click="editor.locateIssue(issue)">定位</button>
        </li>
      </ul>
      <details v-if="editor.validationDialog.source" class="sce-source">
        <summary>SCXML</summary>
        <pre>{{ editor.validationDialog.source }}</pre>
      </details>
      <div class="sce-dialog-btns">
        <button class="sce-primary" @click="editor.closeValidationDialog()">{{ editor.labels.close }}</button>
      </div>
    </div>
  </div>
</template>
