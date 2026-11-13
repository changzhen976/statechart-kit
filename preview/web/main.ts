/**
 * statechart-kit 只读预览页。
 *
 * 数据来源：GET /api/latest，返回 { kind: 'scxml'|'json', name, text, mtime }。
 * 不保存、不修改文件；只用于查看最新图并做本地仿真。
 */
import { mountEditor } from '../../src/vue/index'
import { scxmlToDoc } from '../../src/core/scxml-import'
import type { ProjectDoc } from '../../src/core/model'

const token = new URLSearchParams(location.search).get('token') || ''
let lastMtime = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

interface LatestPayload {
  kind: 'scxml' | 'json'
  name: string
  text: string
  mtime: string
}

const statusEl = document.getElementById('status')!
const refreshEl = document.getElementById('refresh') as HTMLButtonElement

function setStatus(text: string, error = false): void {
  statusEl.textContent = text
  statusEl.classList.toggle('error', error)
}

async function fetchLatest(): Promise<{ doc: ProjectDoc; label: string; mtime: string }> {
  const res = await fetch(`/api/latest${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
    cache: 'no-store',
    ...(token ? { headers: { 'x-preview-token': token } } : {}),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`/api/latest ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`)
  }
  const payload = (await res.json()) as LatestPayload
  if (payload.kind === 'json') {
    const doc = JSON.parse(payload.text) as ProjectDoc
    if (!doc || doc.formatVersion !== 1) throw new Error('JSON 不是合法的 ProjectDoc（formatVersion 必须为 1）')
    return { doc, label: `${payload.name} · ${payload.mtime}`, mtime: payload.mtime }
  }
  const parsed = scxmlToDoc(payload.text)
  return { doc: parsed.doc, label: `${payload.name} · ${payload.mtime}`, mtime: payload.mtime }
}

const mounted = mountEditor('#app', {
  autoLoad: false,
  features: {
    toolbar: true,
    structure: true,
    canvas: true,
    properties: true,
    structuredActions: true,
    variables: true,
    events: true,
    simulation: true,
    simBar: true,
    validation: true,
    explorer: true,
    resizablePanes: true,
    importExport: false,
    examples: false,
    undoRedo: false,
    deploy: false,
    exit: false,
  },
  adapter: {
    load: () => null,
    readOnly: true,
    externalEvents: () => [
      { value: 'start', tag: '宿主' },
      { value: 'external.poke', tag: '宿主' },
    ],
    runner: { engine: 'trusted' },
  },
})

async function load(silent = false): Promise<void> {
  if (!silent) refreshEl.disabled = true
  if (!silent) setStatus('加载中…')
  try {
    const latest = await fetchLatest()
    await mounted.ready
    await mounted.editor.loadDoc(latest.doc)
    lastMtime = latest.mtime
    setStatus(`已加载：${latest.label}`)
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true)
  } finally {
    if (!silent) refreshEl.disabled = false
  }
}

async function pollLatest(): Promise<void> {
  const auto = document.getElementById('auto') as HTMLInputElement | null
  if (!auto?.checked) return
  try {
    const latest = await fetchLatest()
    if (!lastMtime || latest.mtime === lastMtime) return
    if (mounted.editor.sim.running) {
      setStatus('检测到新版本，停止仿真后自动刷新')
      return
    }
    await mounted.editor.loadDoc(latest.doc)
    lastMtime = latest.mtime
    setStatus(`已自动刷新：${latest.label}`)
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true)
  }
}

refreshEl.addEventListener('click', () => void load())
void load().then(() => {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(() => void pollLatest(), 3000)
})
window.addEventListener('beforeunload', () => {
  if (pollTimer) clearInterval(pollTimer)
})
