import { inject, type InjectionKey } from 'vue'
import type { EditorStore } from './editor-store'

export const EDITOR_KEY: InjectionKey<EditorStore> = Symbol('statechart-kit:editor')

/** 在 EditorHost 的子树里取当前编辑器；缺失时给出明确错误 */
export function useEditor(): EditorStore {
  const editor = inject(EDITOR_KEY)
  if (!editor) throw new Error('useEditor() 必须在 <EditorHost> 子树内使用')
  return editor
}
