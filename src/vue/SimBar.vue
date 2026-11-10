<script setup lang="ts">
import { computed } from 'vue'
import { useEditor } from './use-editor'

const editor = useEditor()
const SPEEDS = [0.25, 0.5, 1, 2, 4]
const active = computed(() => editor.activeLabels)
</script>

<template>
  <footer v-if="editor.sim.running || editor.sim.log.length" class="sce-simbar">
    <template v-if="editor.sim.running">
      <button @click="editor.togglePause()">
        {{ editor.sim.paused ? editor.labels.play : editor.labels.pause }}
      </button>
      <button @click="editor.stepSim()">{{ editor.labels.step }}</button>
      <select
        :value="editor.sim.speed"
        class="sce-speed"
        @change="editor.setSpeed(Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="s in SPEEDS" :key="s" :value="s">{{ s }}x</option>
      </select>
      <button class="sce-danger" @click="editor.stopSim()">{{ editor.labels.stop }}</button>
      <span class="sce-active-label">{{ editor.labels.active }}：</span>
      <span v-for="a in active" :key="a" class="sce-chip">{{ a }}</span>
      <span v-if="!active.length" class="sce-meta">—</span>
      <span class="sce-hint">{{ editor.labels.runningHint }}</span>
    </template>
    <template v-else>
      <span class="sce-hint">{{ editor.labels.emptyHint }}</span>
    </template>
  </footer>
</template>
