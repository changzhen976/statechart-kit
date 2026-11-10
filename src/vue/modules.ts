/**
 * 编辑器模块契约（P4）。
 *
 * kit 的核心编辑器负责“状态机怎么建立与编辑”；全局变量、事件路由、MQTT、部署、
 * Node-RED 嵌入等上层能力由宿主以 `EditorModule` 注入，不进入 kit 内部实现。
 *
 * 约束：
 * - 模块只通过 `EditorModuleContext` 贡献 UI/事件来源/校验/命令，不直接改编辑器内部状态；
 * - 文档编辑必须走 `editor` 的公开 action，保证撤销/保存一致；
 * - 一个编辑器只有一份 `NamingPolicy`（宿主组合），模块不要各自设置策略；
 * - 模块的 setup 抛错会被隔离并记录，不会阻断编辑器。
 */
import type { ExternalEventSource } from '../core/event-catalog'
import type { MetaValue, ProjectDoc } from '../core/model'
import type { NamingPolicy } from '../core/naming-policy'
import type { EditorStore } from './editor-store'

/** 右侧标签页贡献（全局变量 / 事件路由 / MQTT 规则…） */
export interface EditorTabContribution {
  /** 全局唯一；不能与内置 props/vars/sim 冲突 */
  id: string
  title: string
  component: object
  /** 升序；缺省 100（内置页在前） */
  order?: number
  /** 动态可见性（缺省可见） */
  visible?: (editor: EditorStore) => boolean
}

/** 工具栏命令贡献（部署、连接设置、打开宿主面板…） */
export interface EditorToolbarContribution {
  id: string
  label: string
  title?: string
  order?: number
  tone?: 'default' | 'primary' | 'danger'
  /** 缺省可用；抛错按不可用处理 */
  disabled?: (editor: EditorStore) => boolean
  run: (editor: EditorStore) => void | Promise<void>
}

/** 变量/事件属性字段类型 */
export type EditorFieldType = 'boolean' | 'select' | 'text' | 'number'

export interface EditorFieldOption {
  value: string
  label: string
}

/**
 * 通用属性字段（宿主注册）。
 *
 * kit 只负责渲染/写入 `DataVar.attrs` 或 `ProjectDoc.eventAttrs`，不解释 key 的语义：
 * creator 注册 `global`/`broadcast`，Node-RED 可注册 `scope`/`route`。
 */
export interface EditorAttributeField {
  /** 全局唯一（避免多个模块抢同一 key） */
  id: string
  /** 写入 attrs 的键 */
  key: string
  label: string
  title?: string
  type: EditorFieldType
  /** type=select 时必填 */
  options?: readonly EditorFieldOption[]
  defaultValue?: MetaValue
  /** 升序；缺省 100 */
  order?: number
}

export interface EditorAttributeFieldRegistry {
  add(field: EditorAttributeField): () => void
  remove(id: string): void
}

/** 外部事件来源（时钟/路由/MQTT 入向）；与内置 adapter.externalEvents 合并 */
export interface EditorEventSourceProvider {
  id: string
  provide: (editor: EditorStore) => ExternalEventSource[] | Promise<ExternalEventSource[]>
}

/** 模块校验问题；severity 缺省 error */
export interface EditorModuleIssue {
  code: string
  params?: Record<string, unknown>
  severity?: 'error' | 'warning'
  stateId?: string
  event?: string
  transitionId?: string
  actionIndex?: number
}

export interface EditorValidationContext {
  doc: ProjectDoc
  policy: NamingPolicy
}

/** 额外校验（全局变量是否声明、路由保留事件、MQTT 绑定…） */
export type EditorValidator = (
  ctx: EditorValidationContext,
) => EditorModuleIssue[] | Promise<EditorModuleIssue[]>

export interface EditorTabRegistry {
  add(contribution: EditorTabContribution): () => void
  remove(id: string): void
}

export interface EditorToolbarRegistry {
  add(contribution: EditorToolbarContribution): () => void
  remove(id: string): void
}

export interface EditorEventSourceRegistry {
  add(provider: EditorEventSourceProvider): () => void
  remove(id: string): void
  /** 重新拉取 adapter + 所有模块来源 */
  refresh(): Promise<void>
}

export interface EditorValidatorRegistry {
  add(validator: EditorValidator): () => void
  clear(): void
}

export interface EditorModuleContext {
  editor: EditorStore
  tabs: EditorTabRegistry
  toolbar: EditorToolbarRegistry
  eventSources: EditorEventSourceRegistry
  validators: EditorValidatorRegistry
  /** 变量行内的宿主属性字段（如“全局”） */
  variableFields: EditorAttributeFieldRegistry
  /** 事件属性字段（如“广播”） */
  eventFields: EditorAttributeFieldRegistry
  /** 模块自定义清理；destroy 时按注册逆序执行 */
  onDispose(fn: () => void): void
}

export interface EditorModule {
  id: string
  setup(ctx: EditorModuleContext): void | (() => void)
}
