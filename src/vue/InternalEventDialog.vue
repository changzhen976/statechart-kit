<script setup lang="ts">
/**
 * 「仅内部」定义/约束弹窗（0.15）。
 *
 * 勾选「仅内部」时先扫描生产者/监听者：干净则确认后写入；有冲突则逐条列出，
 * 普通 send 可一键改为 target="#_internal"，其余给出手动修复说明。
 * 「本次会话不再提示」只写内存（编辑器不读 localStorage）；有冲突时仍会弹出。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditor } from './use-editor'
import type { InternalOnlyProducer } from '../core/internal-only'

const editor = useEditor()
const suppress = ref(false)
const primary = ref<HTMLButtonElement | null>(null)

const dialog = computed(() => editor.internalEventDialog)
const conflictsText = computed(() =>
  editor.labels.internalOnlyConflicts.replace('{count}', String(dialog.value?.conflicts ?? 0)),
)

watch(
  () => editor.internalEventDialog,
  (next) => {
    if (!next) return
    suppress.value = editor.internalOnlySuppressed
    void nextTick(() => primary.value?.focus())
  },
  { immediate: true },
)

function channelLabel(producer: InternalOnlyProducer): string {
  if (producer.channel === 'internal') return editor.labels.eventSourceInternal
  if (producer.channel === 'auto-delay') return editor.labels.eventSourceAutoDelay
  return editor.labels.eventSourceSend
}

function reasonLabel(producer: InternalOnlyProducer): string {
  if (producer.reason === 'auto-delay') return editor.labels.internalOnlyAutoDelay
  if (producer.reason === 'internal-delay') return editor.labels.internalOnlyInternalDelay
  return editor.labels.internalOnlyManualFix
}

function producerLabel(producer: InternalOnlyProducer): string {
  if (producer.kind !== 'state-action') {
    return `${producer.transitionSourceLabel ?? ''} → ${producer.transitionTargetLabel ?? editor.labels.noTarget}`
  }
  const base = producer.stateLabel ?? producer.stateId ?? producer.stateUid ?? ''
  const slot =
    producer.slot === 'entry'
      ? editor.labels.entryActions
      : producer.slot === 'exit'
        ? editor.labels.exitActions
        : ''
  return slot ? `${base} · ${slot}` : base
}

function close(): void {
  editor.cancelInternalOnly()
}

function confirm(): void {
  editor.confirmInternalOnly(suppress.value)
}

function fix(producer: InternalOnlyProducer): void {
  editor.fixInternalOnlyProducer(producer.id)
}

function onKey(e: KeyboardEvent): void {
  if (!editor.internalEventDialog) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'Enter') {
    const target = e.target as HTMLElement | null
    if (target?.tagName === 'BUTTON' || target?.tagName === 'INPUT') return
    if (!editor.internalEventDialog.canConfirm) return
    e.preventDefault()
    confirm()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="dialog" class="sce-overlay" @click.self="close">
    <div
      class="sce-dialog sce-dialog-wide sce-internal-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sce-internal-only-title"
    >
      <h3 id="sce-internal-only-title">
        {{ editor.labels.internalOnlyTitle }} · <code>{{ dialog.event }}</code>
      </h3>
      <p class="sce-msg">{{ editor.labels.internalOnlyDefinition }}</p>

      <ul class="sce-internal-rules">
        <li class="ok">✓ {{ editor.labels.internalOnlyAllowed }}</li>
        <li class="no">✗ {{ editor.labels.internalOnlyForbidden }}</li>
        <li>{{ editor.labels.internalOnlyConsumerRule }}</li>
      </ul>

      <h4>{{ editor.labels.internalOnlyScan }}</h4>
      <div class="sce-internal-grid">
        <section>
          <h5>{{ editor.labels.internalOnlyProducers }}</h5>
          <ul class="sce-internal-list">
            <li
              v-for="producer in dialog.producers"
              :key="producer.id"
              :class="{ bad: producer.conflict }"
            >
              <span class="src">{{ producerLabel(producer) }}</span>
              <span class="chan">{{ channelLabel(producer) }}</span>
              <button v-if="producer.canFix" class="mini" type="button" @click="fix(producer)">
                {{ editor.labels.internalOnlyFixSend }}
              </button>
              <span v-else-if="producer.conflict" class="hint">{{ reasonLabel(producer) }}</span>
            </li>
            <li v-if="!dialog.producers.length" class="muted">
              {{ editor.labels.internalOnlyNoProducer }}
            </li>
          </ul>
        </section>
        <section>
          <h5>{{ editor.labels.internalOnlyListeners }}</h5>
          <ul class="sce-internal-list">
            <li v-for="listener in dialog.listeners" :key="listener.transitionId" :class="{ bad: listener.mixed }">
              <span class="src">
                {{ listener.sourceLabel }} → {{ listener.targetLabel || editor.labels.noTarget }}
              </span>
              <code>{{ listener.events.join(' ') }}</code>
              <span v-if="listener.mixed" class="hint">{{ editor.labels.internalOnlyMixed }}</span>
            </li>
            <li v-if="!dialog.listeners.length" class="muted">—</li>
          </ul>
        </section>
      </div>

      <p v-if="dialog.conflicts" class="sce-error">{{ conflictsText }}</p>
      <p v-else class="sce-internal-ok">✓ {{ editor.labels.internalOnlyReady }}</p>
      <p class="sce-meta">{{ editor.labels.internalOnlyNotSecurity }}</p>

      <label class="sce-internal-suppress">
        <input v-model="suppress" type="checkbox" />
        {{ editor.labels.internalOnlySuppress }}
      </label>

      <div class="sce-dialog-btns">
        <button type="button" @click="close">{{ editor.labels.cancel }}</button>
        <button
          ref="primary"
          class="sce-primary"
          type="button"
          :disabled="!dialog.canConfirm"
          @click="confirm"
        >{{ editor.labels.internalOnlySet }}</button>
      </div>
    </div>
  </div>
</template>
