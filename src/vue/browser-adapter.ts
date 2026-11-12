/**
 * 浏览器默认适配器：localStorage 自动保存 + 文件导入导出 + 内置示例。
 * 宿主可只覆盖其中一两个方法；未覆盖的走这里。
 */
import { EXAMPLES } from '../core/examples'
import { normalizeDoc, type ProjectDoc } from '../core/model'
import type { NamingPolicy } from '../core/naming-policy'
import { migrateDoc } from '../core/migrate'
import { scxmlToDoc } from '../core/scxml-import'
import { formatImportWarning } from './format'
import type { ImportWarning } from '../core/scxml-import'
import type { EditorAdapter, EditorImportResult } from './types'

export interface BrowserAdapterOptions {
  /** localStorage key；默认 `statechart-kit:doc` */
  storageKey?: string
  /** 迁移策略（默认不做迁移，仅 normalize） */
  policy?: NamingPolicy
  /** 是否使用内置示例（默认 true） */
  examples?: boolean
  /** 导入警告的本地化；默认中文 */
  formatImportWarning?: (warning: ImportWarning) => string
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function importFile(formatWarning: (warning: ImportWarning) => string): Promise<EditorImportResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json,.scxml,.xml,application/xml'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        reject(new Error('未选择文件'))
        return
      }
      void file
        .text()
        .then((text) => {
          const lower = file.name.toLowerCase()
          const isScxml = lower.endsWith('.scxml') || lower.endsWith('.xml')
          const looksJson = !isScxml && text.trimStart().startsWith('{')
          if (!isScxml && !looksJson && !lower.endsWith('.json')) {
            throw new Error(`不支持的文件类型：${file.name}`)
          }
          if (looksJson || (!isScxml && lower.endsWith('.json'))) {
            const doc = JSON.parse(text) as ProjectDoc
            if (doc?.formatVersion !== 1) throw new Error('formatVersion 不受支持')
            resolve({ doc: normalizeDoc(doc), source: 'json' })
            return
          }
          const r = scxmlToDoc(text)
          resolve({
            doc: r.doc,
            source: 'scxml',
            warnings: r.warnings.map(formatWarning),
          })
        })
        .catch((e) => reject(e instanceof Error ? e : new Error(String(e))))
    }
    input.click()
  })
}

/** 创建浏览器默认适配器（Node/SSR 环境调用 load/save 会安全地 no-op/返回 null） */
export function createBrowserAdapter(opts: BrowserAdapterOptions = {}): EditorAdapter {
  const key = opts.storageKey ?? 'statechart-kit:doc'
  const formatWarning = opts.formatImportWarning ?? formatImportWarning
  return {
    load(): ProjectDoc | null {
      if (!hasLocalStorage()) return null
      const raw = localStorage.getItem(key)
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw) as ProjectDoc
        if (parsed?.formatVersion !== 1) return null
        const normalized = normalizeDoc(parsed)
        return opts.policy ? migrateDoc(opts.policy, normalized).doc : normalized
      } catch {
        return null
      }
    },
    save(doc: ProjectDoc): void {
      if (!hasLocalStorage()) return
      try {
        localStorage.setItem(key, JSON.stringify(doc))
      } catch {
        /* 存储满/隐私模式：静默失败，编辑器仍有内存状态 */
      }
    },
    importProject: () => importFile(formatWarning),
    exportProject(doc: ProjectDoc): void {
      download(
        `${doc.name || 'project'}.statechart.json`,
        JSON.stringify(doc, null, 2),
        'application/json',
      )
    },
    exportScxml(xml: string, doc: ProjectDoc): void {
      download(`${doc.name || 'chart'}.scxml`, xml, 'application/scxml+xml')
    },
    examples: opts.examples === false ? [] : EXAMPLES,
  }
}
