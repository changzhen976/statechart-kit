/**
 * 编辑器宿主适配层（P3）。
 *
 * 编辑器本身不读 localStorage、不发 HTTP、不 import 服务端 store。所有宿主能力
 * （持久化、文件导入导出、示例、外部事件来源、部署/退出）都从 `EditorAdapter` 注入。
 * 未实现的适配器方法会回退到浏览器默认实现；纯 Node/SSR 环境不挂载编辑器。
 */
import type { ProjectDoc } from '../core/model'
import type { NamingPolicy } from '../core/naming-policy'
import type { ExternalEventSource } from '../core/event-catalog'
import type { SessionRunnerOptions } from '../engine/session-runner'
import type { DOMParserLike } from '@tinyactors/scxmljs/trusted'
import type { ExplorerStrings } from '@tinyactors/scxmljs/explorer'

export interface EditorImportResult {
  doc: ProjectDoc
  /** 导入降级说明（宿主自行本地化；默认编辑器按字符串日志显示） */
  warnings?: string[]
  source?: 'json' | 'scxml'
}

/** 内置示例（不传则使用 core EXAMPLES） */
export interface EditorExample {
  name: string
  make: () => ProjectDoc
}

export interface EditorAdapter {
  /** 持久化读取（localStorage/服务端草稿）；返回 null = 无存档 */
  load?(): ProjectDoc | null | Promise<ProjectDoc | null>
  /** 自动保存（防抖后调用）；与 exportProject 不同，不触发文件下载 */
  save?(doc: ProjectDoc): void | Promise<void>
  /** 手动“打开”：文件选择/服务端草稿 */
  importProject?(): EditorImportResult | Promise<EditorImportResult>
  /** 手动“保存”：下载/写回宿主；缺省时仅 save() */
  exportProject?(doc: ProjectDoc): void | Promise<void>
  /** 导出标准 SCXML；缺省时浏览器下载 */
  exportScxml?(xml: string, doc: ProjectDoc): void | Promise<void>
  examples?: EditorExample[]
  /** 时钟/路由/MQTT 等外部事件来源（编辑器事件下拉用） */
  externalEvents?(): ExternalEventSource[] | Promise<ExternalEventSource[]>
  /** 宿主声明「不可标记为仅内部」的事件（服务端时钟/系统事件等）；事件面板禁用复选框 */
  lockedInternalOnly?(name: string): boolean
  /** 会话选项（引擎/damParser/timeout/data）；domParser 也可单独提供 */
  runner?: SessionRunnerOptions
  /** `features.explorer` 打开时的界面文案覆盖（未提供的键用官方英文默认值） */
  explorerStrings?: Partial<ExplorerStrings>
  domParser?: DOMParserLike
  /** 命名策略；缺省 BASE_POLICY（无前缀规则，宿主应传入自己的策略） */
  policy?: NamingPolicy
  /** 只读（服务端软锁/他人编辑） */
  readOnly?: boolean | (() => boolean)
  /** 部署按钮；存在且 features.deploy 时显示 */
  deploy?(doc: ProjectDoc): void | Promise<void>
  /** 是否可以部署（缺省 true） */
  canDeploy?(): boolean
  /** 退出编辑 */
  exit?(doc: ProjectDoc): void
  /** 脏状态变化（宿主可做 beforeunload/离开守卫） */
  onDirtyChange?(dirty: boolean): void
  /** 文档变化（选中/编辑后） */
  onDocChange?(doc: ProjectDoc): void
  /** 自定义日志（宿主接入自己的日志面板） */
  onLog?(entry: { time: number; level: 'info' | 'warn' | 'error'; text: string }): void
}
