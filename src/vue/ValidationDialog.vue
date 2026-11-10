<script setup lang="ts">
import { useEditor } from './use-editor'
import { formatValidationIssue } from './format'

const editor = useEditor()
</script>

<template>
  <div v-if="editor.validationDialog" class="sce-overlay" @click.self="editor.closeValidationDialog()">
    <div class="sce-dialog sce-dialog-wide" role="dialog">
      <h3>{{ editor.validationDialog.title }}</h3>
      <ul class="sce-issues">
        <li v-for="(issue, i) in editor.validationDialog.issues" :key="i">
          <span class="sce-issue-kind">{{ issue.kind }}</span>
          <span>{{ formatValidationIssue(issue) }}</span>
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
