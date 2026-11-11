<script setup lang="ts">
/**
 * 结构化动作编辑器（B1 混合式）：底层数据是 DSL 字符串数组（string[]，项目
 * 数据模型/序列化器零改动），本组件只做"解析 → 表单化编辑 → 生成"的视图层。
 *
 * - 每行按类型渲染：延时发送 / 撤销事件 / 赋值 / 日志 / 自定义 JS
 * - send 行的 data 字段支持静态 JSON，或 `=表达式`（如 `={value: sm}`）发送变量当前值
 * - 无法识别的行自动退化为 JS 行（原文保留，可编辑），不丢数据
 * - 添加动作下拉（ACTION_KINDS）；× 删除；disabled 时整体只读
 * - 提交时机：@change（失焦/回车），避免每键重建行列表
 */
import { computed, nextTick, ref, watch } from 'vue'
import {
  ACTION_KINDS,
  actionToLine,
  parseActionLine,
  type ActionStruct,
} from '../core/action-parse'
import type { EditorEventOption } from './events'
import { checkEventName, checkVarName } from '../core/naming'
import { formatNamingIssue } from './format'
import { useEditor } from './use-editor'
import EventCombo from './EventCombo.vue'

const props = defineProps<{
  modelValue: string[]
  disabled?: boolean
  /** 可选：赋值目标的候选变量（下拉可选，亦可手输） */
  variableOptions?: string[]
  /** 可选：撤销 sendid 的候选（来自全图 send ... id X，下拉可选） */
  sendIdOptions?: string[]
  /** 可选：事件名候选（本机转移/发送事件 + 全局时钟/路由） */
  eventOptions?: EditorEventOption[]
  /** 校验弹窗「定位」聚焦的行号（1 起）；变化时滚动该行并短暂高亮 */
  focusIndex?: number | null
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>()
const editor = useEditor()

// ── 定位高亮（P3）：focusIndex 变化 → 该行 scrollIntoView + flash ──
const flashIndex = ref<number | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => props.focusIndex,
  (n) => {
    if (!n || n < 1) return
    flashIndex.value = n
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => (flashIndex.value = null), 2200)
    nextTick(() => {
      document
        .querySelector(`.ale-row[data-action-index="${n}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  },
  { immediate: true },
)

/** 命名规则校验错误（保留字/废弃前缀阻断时显示） */
const namingErr = ref('')
/** 阻断后自增，强制行重挂载以还原输入框显示 */
const revertTick = ref(0)

// ── 拖拽排序（原生 DnD，拖柄发起；disabled 时拖柄不渲染） ──
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

function onDragStart(i: number, e: DragEvent): void {
  dragIndex.value = i
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
  }
}
function onDragOver(i: number): void {
  if (dragIndex.value === null) return
  overIndex.value = i
}
function onDrop(i: number): void {
  const from = dragIndex.value
  endDrag()
  if (from === null || from === i) return
  const next = [...props.modelValue]
  const [moved] = next.splice(from, 1)
  next.splice(i, 0, moved)
  emit('update:modelValue', next)
}
function endDrag(): void {
  dragIndex.value = null
  overIndex.value = null
}

// ── 自定义 JS 行高度档位：0=3行（默认多行）→ 1=10行 → 2=16行 循环 ──
const SCRIPT_ROWS = [3, 10, 16]
const scriptLevels = ref<Record<number, number>>({})
function scriptRows(i: number): number {
  return SCRIPT_ROWS[scriptLevels.value[i] ?? 0]
}
function cycleScript(i: number): void {
  const next = (scriptLevels.value[i] ?? 0) + 1
  scriptLevels.value = { ...scriptLevels.value, [i]: next % SCRIPT_ROWS.length }
}

const rows = computed<ActionStruct[]>(() => props.modelValue.map(parseActionLine))

/** 自定义下拉：键为 `${行索引}:${字段}`，保证每行每字段独立开合 */
const openDd = ref<string | null>(null)
function toggleDd(key: string): void {
  openDd.value = openDd.value === key ? null : key
}
function closeDd(): void {
  openDd.value = null
}
function pickOption(i: number, field: 'target' | 'sendid', value: string): void {
  openDd.value = null
  if (field === 'target') patch(i, { type: 'assign', target: value })
  else patch(i, { type: 'cancel', sendid: value })
}

function update(index: number, struct: ActionStruct): void {
  // 命名规则校验（v2）：保留字/废弃前缀直接拒绝提交（报警 + 不修改），行强制还原
  if (struct.type === 'send') {
    const issue = checkEventName(editor.policy, struct.event, { doc: editor.doc })
    if (issue?.level === 'block') {
      namingErr.value = `第 ${index + 1} 行：${formatNamingIssue(issue)}`
      revertTick.value++
      return
    }
  }
  if (struct.type === 'assign') {
    const issue = checkVarName(editor.policy, struct.target)
    if (issue?.level === 'block') {
      namingErr.value = `第 ${index + 1} 行：${formatNamingIssue(issue)}`
      revertTick.value++
      return
    }
  }
  namingErr.value = ''
  const next = [...props.modelValue]
  next[index] = actionToLine(struct)
  emit('update:modelValue', next)
}

function patch(index: number, p: Partial<ActionStruct>): void {
  const base = parseActionLine(props.modelValue[index] ?? '')
  update(index, { ...base, ...p } as ActionStruct)
}

function remove(index: number): void {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}

function add(kind: (typeof ACTION_KINDS)[number]): void {
  const defaults: Record<ActionStruct['type'], ActionStruct> = {
    send: { type: 'send', event: '事件名' },
    cancel: { type: 'cancel', sendid: '定时器' },
    assign: { type: 'assign', target: '变量', expr: '0' },
    log: { type: 'log', expr: '"日志内容"' },
    script: { type: 'script', code: '/* JS 语句 */' },
  }
  const struct: ActionStruct =
    kind.label === 'action.send'
      ? { type: 'send', event: '事件名' }
      : kind.label === 'action.send-delayed'
        ? { type: 'send', event: '事件名', delay: '1s', id: '定时器' }
        : (kind.template ?? defaults[kind.type])
  emit('update:modelValue', [...props.modelValue, actionToLine(struct)])
}

/** kit 的 ACTION_KINDS.label 是消息 code；宿主负责本地化 */
const ACTION_LABELS: Record<string, string> = {
  'action.send': '发送事件',
  'action.send-delayed': '延时发送',
  'action.cancel': '撤销事件',
  'action.assign': '赋值',
  'action.log': '日志',
  'action.script': '自定义 JS',
}
const actionLabel = (code: string): string => ACTION_LABELS[code] ?? code

const typeBadge: Record<ActionStruct['type'], string> = {
  send: '发送',
  cancel: '撤销',
  assign: '赋值',
  log: '日志',
  script: 'JS',
}
const badgeClass: Record<ActionStruct['type'], string> = {
  send: 'b-send',
  cancel: 'b-cancel',
  assign: 'b-assign',
  log: 'b-log',
  script: 'b-script',
}

function onInput(i: number, p: Partial<ActionStruct>): void {
  patch(i, p)
}

/** 发送动作的数据：`=表达式`（动态）或 JSON（静态） */
function dataText(row: ActionStruct): string {
  if (row.type !== 'send') return ''
  if (row.dataExpr !== undefined) return `=${row.dataExpr}`
  if (row.data !== undefined) return JSON.stringify(row.data)
  return ''
}

function setSendData(i: number, raw: string): void {
  const base = parseActionLine(props.modelValue[i] ?? '')
  if (base.type !== 'send') return
  const next: ActionStruct = { ...base }
  delete next.data
  delete next.dataExpr
  const v = raw.trim()
  if (v.startsWith('=')) {
    const expr = v.slice(1).trim()
    if (expr) next.dataExpr = expr
  } else if (v) {
    try {
      next.data = JSON.parse(v)
    } catch {
      // 非 JSON 且未写 = 时按表达式处理，便于直接写 {value: sm}
      next.dataExpr = v
    }
  }
  update(i, next)
}
</script>

<template>
  <div class="ale" :class="{ disabled }">
    <p v-if="namingErr" class="ale-naming-err">⛔ {{ namingErr }}</p>
    <div
      v-for="(row, i) in rows"
      :key="`${i}-${revertTick}`"
      class="ale-row"
      :class="[
        `t-${row.type}`,
        {
          dragging: dragIndex === i,
          'drop-target': dragIndex !== null && overIndex === i && dragIndex !== i,
          flash: flashIndex === i + 1,
        },
      ]"
      :data-action-index="i + 1"
      @dragover.prevent="onDragOver(i)"
      @drop.prevent="onDrop(i)"
    >
      <span
        v-if="!disabled"
        class="drag-handle"
        draggable="true"
        title="拖动调整顺序"
        @dragstart="onDragStart(i, $event)"
        @dragend="endDrag"
      >⠿</span>
      <span class="ale-badge" :class="badgeClass[row.type]">{{ typeBadge[row.type] }}</span>

      <!-- 延时发送 -->
      <template v-if="row.type === 'send'">
        <EventCombo
          class="f-ev"
          :model-value="row.event"
          :options="eventOptions"
          :disabled="disabled"
          placeholder="事件名"
          title="事件名（下拉含本机转移/发送 + 全局时钟/路由）"
          @change="onInput(i, { type: 'send', event: $event })"
        />
        <input
          class="f-small"
          :value="row.delay ?? ''"
          :disabled="disabled"
          placeholder="延时"
          title="延时（如 3s / 500ms）"
          @change="
            onInput(
              i,
              { type: 'send', event: row.event, delay: ($event.target as HTMLInputElement).value || undefined },
            )
          "
        />
        <input
          class="f-small"
          :value="row.id ?? ''"
          :disabled="disabled"
          placeholder="sendid"
          title="sendid（供 cancel 撤销）"
          @change="
            onInput(
              i,
              { type: 'send', event: row.event, delay: row.delay, id: ($event.target as HTMLInputElement).value || undefined },
            )
          "
        />
        <input
          class="f-data"
          :value="dataText(row)"
          :disabled="disabled"
          placeholder="data JSON；或 =表达式（如 ={value: sm}）"
          title="静态 JSON 直接用；需要发送变量当前值用 =表达式，例如 ={value: sm}"
          @change="setSendData(i, ($event.target as HTMLInputElement).value)"
        />
      </template>

      <!-- 撤销事件 -->
      <template v-else-if="row.type === 'cancel'">
        <span class="lbl">撤销</span>
        <div class="combo">
          <input
            :value="row.sendid"
            :disabled="disabled"
            placeholder="sendid"
            @change="onInput(i, { type: 'cancel', sendid: ($event.target as HTMLInputElement).value })"
            @blur="closeDd"
          />
          <button
            v-if="!disabled && (sendIdOptions?.length ?? 0) > 0"
            class="dd-btn"
            tabindex="-1"
            title="选择 sendid"
            @mousedown.prevent="toggleDd(i + ':sendid')"
          >▼</button>
          <div v-if="openDd === i + ':sendid'" class="dd-list">
            <div
              v-for="v in sendIdOptions"
              :key="v"
              class="dd-opt"
              @mousedown.prevent="pickOption(i, 'sendid', v)"
            >{{ v }}</div>
          </div>
        </div>
      </template>

      <!-- 赋值 -->
      <template v-else-if="row.type === 'assign'">
        <div class="combo">
          <input
            class="f-var"
            :value="row.target"
            :disabled="disabled"
            placeholder="变量"
            @change="onInput(i, { type: 'assign', target: ($event.target as HTMLInputElement).value, expr: row.expr })"
            @blur="closeDd"
          />
          <button
            v-if="!disabled && (variableOptions?.length ?? 0) > 0"
            class="dd-btn"
            tabindex="-1"
            title="选择变量"
            @mousedown.prevent="toggleDd(i + ':target')"
          >▼</button>
          <div v-if="openDd === i + ':target'" class="dd-list">
            <div
              v-for="v in variableOptions"
              :key="v"
              class="dd-opt"
              @mousedown.prevent="pickOption(i, 'target', v)"
            >{{ v }}</div>
          </div>
        </div>
        <span class="lbl">=</span>
        <input
          :value="row.expr"
          :disabled="disabled"
          placeholder="JS 表达式"
          @change="onInput(i, { type: 'assign', target: row.target, expr: ($event.target as HTMLInputElement).value })"
        />
      </template>

      <!-- 日志 -->
      <template v-else-if="row.type === 'log'">
        <span class="lbl">log</span>
        <input
          :value="row.expr"
          :disabled="disabled"
          placeholder="JS 表达式"
          @change="onInput(i, { type: 'log', expr: ($event.target as HTMLInputElement).value })"
        />
      </template>

      <!-- 自定义 JS：默认多行 textarea，右下角按键循环展开档位（3/10/16 行） -->
      <template v-else>
        <span
          class="warn"
          title="自定义 JS 动作将生成 script CDATA：浏览器运行不受影响，但服务端（Node/happy-dom）部署受限。建议改用 延时发送/撤销/赋值/日志"
        >⚠</span>
        <div class="f-js-wrap">
          <textarea
            class="f-js"
            :rows="scriptRows(i)"
            :value="row.code"
            :disabled="disabled"
            placeholder="JS 语句（可多行）"
            spellcheck="false"
            @change="onInput(i, { type: 'script', code: ($event.target as HTMLTextAreaElement).value })"
          />
          <button
            class="js-grip"
            type="button"
            tabindex="-1"
            :disabled="disabled"
            :title="scriptRows(i) > 3 ? '收起' : '展开更多行'"
            @click="cycleScript(i)"
          >⇕</button>
        </div>
      </template>

      <button class="del" :disabled="disabled" title="删除此动作" @click="remove(i)">×</button>
    </div>

    <div v-if="!rows.length" class="empty">暂无动作</div>

    <div v-if="!disabled" class="ale-add">
      <span class="lbl">＋ 添加</span>
      <button v-for="k in ACTION_KINDS" :key="k.label" :title="`添加：${actionLabel(k.label)}`" @click="add(k)">
        {{ actionLabel(k.label) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ale {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--scxml-surface-2);
  border-radius: var(--scxml-radius);
  padding: 6px;
}
.ale-naming-err {
  margin: 0;
  font: 11px var(--scxml-font-sans);
  color: #b42318;
}
.ale.disabled {
  opacity: 0.55;
}
.ale-row.flash {
  outline: 2px solid #b45309;
  background: rgba(180, 83, 9, 0.14);
  transition: background 0.6s ease-out;
}
.ale-row {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--scxml-surface);
  border: 1px solid var(--scxml-border);
  border-radius: 6px;
  padding: 3px 6px;
  min-height: 28px;
}
.ale-row.t-send {
  flex-wrap: wrap;
}
.f-data {
  flex: 1 1 100%;
  order: 5;
}
.ale-badge {
  flex: none;
  font-size: 10px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 4px;
  background: var(--scxml-surface-2);
  color: var(--scxml-fg-muted);
}
.b-send {
  background: var(--scxml-accent-subtle);
  color: var(--scxml-accent-text);
}
.b-cancel {
  background: var(--scxml-error-bg);
  color: var(--scxml-error);
}
.b-assign {
  background: var(--scxml-running-bg);
  color: var(--scxml-running);
}
.b-log {
  background: var(--scxml-waiting-bg);
  color: var(--scxml-waiting);
}
.ale input,
.ale select {
  font: 12px var(--scxml-font-mono);
  color: var(--scxml-fg);
  background: var(--scxml-bg);
  border: 1px solid var(--scxml-border-2);
  border-radius: 4px;
  padding: 3px 6px;
  min-width: 0;
}
.f-ev,
.f-js,
.f-var {
  flex: 1.4;
}
/* 拖拽排序 */
.drag-handle {
  flex: none;
  cursor: grab;
  color: var(--scxml-fg-subtle);
  font: 12px var(--scxml-font-mono);
  padding: 0 1px;
  user-select: none;
}
.drag-handle:active {
  cursor: grabbing;
  color: var(--scxml-accent);
}
.ale-row.dragging {
  opacity: 0.35;
}
.ale-row.drop-target {
  box-shadow: inset 0 2px 0 var(--scxml-accent);
}
/* 自定义 JS：多行 textarea + 右下角展开按键 */
.f-js-wrap {
  position: relative;
  flex: 1.4;
  min-width: 0;
  display: flex;
}
.ale textarea.f-js {
  flex: 1;
  resize: none;
  line-height: 1.45;
  padding: 3px 24px 3px 6px;
  white-space: pre;
}
.js-grip {
  position: absolute;
  right: 2px;
  bottom: 2px;
  flex: none;
  font-size: 10px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 4px;
  color: var(--scxml-fg-subtle);
  background: var(--scxml-surface-2);
  border: 1px solid var(--scxml-border-2);
  cursor: ns-resize;
  opacity: 0.6;
}
.js-grip:hover {
  opacity: 1;
  color: var(--scxml-accent);
  border-color: var(--scxml-accent);
}
.f-small {
  flex: none !important;
  width: 56px;
}
.ale .lbl {
  flex: none;
  color: var(--scxml-fg-subtle);
  font: 11px var(--scxml-font-mono);
}
.del {
  flex: none;
  border: none;
  background: transparent;
  color: var(--scxml-error);
  font-size: 13px;
  cursor: pointer;
  padding: 0 4px;
}
.del:hover:not(:disabled) {
  background: var(--scxml-error-bg) !important;
}
.ale-add {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.ale-add .lbl {
  font: 11px var(--scxml-font-sans);
  color: var(--scxml-fg-subtle);
}
.ale-add button {
  font: 11px var(--scxml-font-sans);
  color: var(--scxml-fg-muted);
  background: var(--scxml-surface);
  border: 1px dashed var(--scxml-border-2);
  border-radius: 5px;
  padding: 2px 8px;
  cursor: pointer;
}
.ale-add button:hover {
  color: var(--scxml-accent);
  border-color: var(--scxml-accent);
}
.empty {
  font: 11px var(--scxml-font-sans);
  color: var(--scxml-fg-faint);
}

/* 组合框：输入 + ▼ 按钮 + 浮层候选列表 */
.combo {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}
.combo input {
  flex: 1;
  min-width: 0;
}
.dd-btn {
  flex: none;
  font-size: 9px;
  line-height: 1;
  color: var(--scxml-fg-muted);
  background: var(--scxml-surface-2);
  border: 1px solid var(--scxml-border-2);
  border-radius: 4px;
  padding: 4px 3px;
  cursor: pointer;
}
.dd-btn:hover {
  color: var(--scxml-accent);
  border-color: var(--scxml-accent);
}
.dd-list {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  min-width: 100%;
  background: var(--scxml-surface);
  border: 1px solid var(--scxml-border-2);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  max-height: 160px;
  overflow-y: auto;
  z-index: 60;
}
.dd-opt {
  padding: 4px 8px;
  font: 12px var(--scxml-font-mono);
  color: var(--scxml-fg);
  cursor: pointer;
  white-space: nowrap;
}
.dd-opt:hover {
  background: var(--scxml-accent-subtle);
  color: var(--scxml-accent-text);
}
.b-script {
  background: var(--scxml-waiting-bg);
  color: var(--scxml-waiting);
}
.warn {
  flex: none;
  color: var(--scxml-waiting);
  cursor: help;
  font-size: 11px;
}
</style>
