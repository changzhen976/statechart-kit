# 编辑器模块（P4）

kit 的核心编辑器负责**状态机的建立与编辑**：文档模型、画布、结构/属性/变量/仿真面板、
校验、撤销、序列化。全局变量、事件路由、MQTT 接入、部署/草稿锁、Node-RED 嵌入等
属于宿主层，通过 `EditorModule` 注入，不进入 kit 内部实现。

## 1. 契约

```ts
import type {
  EditorModule,
  EditorModuleContext,
  EditorTabContribution,
  EditorToolbarContribution,
  EditorEventSourceProvider,
  EditorValidator,
  EditorAttributeField,
} from 'statechart-kit/vue'
```

`EditorModule.setup(ctx)` 在编辑器创建时调用，返回的函数或 `ctx.onDispose` 注册的回调
在 `editor.destroy()` / `mountEditor().unmount()` 时逆序执行。模块 setup 抛错会被隔离并
写入运行日志，不会阻断编辑器。

| 扩展点 | 用途 |
| --- | --- |
| `ctx.tabs.add()` | 右侧标签页：全局变量、事件路由、MQTT 规则 |
| `ctx.toolbar.add()` | 工具栏命令：部署、连接设置、打开宿主面板 |
| `ctx.eventSources.add()` | 外部事件来源：时钟/路由/MQTT 入向，合并进事件下拉 |
| `ctx.validators.add()` | 额外校验：全局变量声明、路由保留事件、MQTT 绑定 |
| `ctx.variableFields.add()` | 变量行属性：`global`/`scope` 等（写入 `DataVar.attrs`） |
| `ctx.eventFields.add()` | 事件属性：宿主自定义 `scope`/`channel` 等（写入 `ProjectDoc.eventAttrs`） |
| `ctx.onDispose()` | 模块自己的清理（订阅、轮询、连接状态监听） |

模块贡献只通过 `EditorStore` 的公开 action 改文档（`addState`/`updateTransition`/`touch` 等），
保证撤销与自动保存一致；不要直接改 `editor.doc` 内部对象。

## 2. 最小示例

```ts
import { defineComponent, h } from 'vue'
import type { EditorModule } from 'statechart-kit/vue'

const GlobalsPanel = defineComponent({
  setup() {
    return () => h('div', { class: 'globals-panel' }, '全局变量')
  },
})

export const globalsModule: EditorModule = {
  id: 'creator.globals',
  setup(ctx) {
    ctx.tabs.add({
      id: 'globals',
      title: '全局变量',
      component: GlobalsPanel,
      order: 20,
    })
    ctx.variableFields.add({
      id: 'creator.variable.global',
      key: 'global',
      label: '全局',
      type: 'boolean',
      defaultValue: false,
    })
    ctx.eventFields.add({
      id: 'host.event.scope',
      key: 'scope',
      label: '范围',
      type: 'select',
      options: [
        { value: 'local', label: '本机' },
        { value: 'shared', label: '共享' },
      ],
      defaultValue: 'local',
    })
    ctx.validators.add(({ doc }) => {
      const bad = doc.datamodel.filter((d) => d.attrs?.global === true && !declared(d.id))
      return bad.map((d) => ({
        code: 'host.global-undeclared',
        params: { name: d.id },
        severity: 'error',
      }))
    })
    const off = service.onGlobalsChange(() => ctx.eventSources.refresh())
    ctx.onDispose(off)
  },
}
```

## 3. 宿主模块划分建议

| 模块 | 内容 | 放哪 |
| --- | --- | --- |
| `creator.globals` | 全局变量注册表视图、声明校验 | `scxml-creator/src/editor-modules/globals.ts` |
| `creator.routes` | 事件路由列表/编辑、外部事件来源 | 同上 `routes.ts` |
| `creator.mqtt` | MQTT 连接状态、入/出向规则、事件来源 | 同上 `mqtt.ts`（或宿主层共享包） |
| `creator.deploy` | 部署命令、草稿锁/冲突、只读 | 同上 `deploy.ts` |
| `nodered.embed` | Node-RED 配置/上下文读写、部署生命周期 | `node-red-contrib-scxmljs/src/editor-module.ts` |

这些模块可以依赖宿主 REST/service store，但不被 kit 依赖。若 creator 与 Node-RED 都需要
MQTT 规则 UI，可抽一个宿主层共享包（例如 `@host/statechart-editor-mqtt`），而不是放回 kit。

## 4. 组合与生命周期

```ts
const mounted = mountEditor('#editor', {
  adapter,
  policy,              // 宿主组合的 NamingPolicy（kit 默认 BASE_POLICY）
  modules: [globalsModule, routesModule, mqttModule, deployModule],
})
await mounted.ready
```

- 模块按传入顺序 `setup`；贡献项按 `order` 排序（缺省 100）。
- `tabs`/`toolbar` 的 id 必须唯一；与内置 `props`/`vars`/`events`/`sim` 冲突会抛错并被隔离。
- `eventSources` 与 `adapter.externalEvents` 的结果按事件名合并：tag 去重、tip 换行。
- 模块校验问题进入统一 `validation.issues`，`kind='module'`，参与 `ok` 判定（warning 不阻断）。
- `editor.destroy()` 先执行模块清理，再停会话/保存。

## 5. 边界

- kit 不认识 `gv_`/`mqe_`/`mqv_`/`sys.`；命名规则由宿主 `NamingPolicy` 提供。
- kit 只持久化/编辑 `DataVar.attrs` 与 `ProjectDoc.eventAttrs` 的通用标量；字段语义由模块解释。
- kit 不持有 MQTT 连接、路由表、全局变量注册表；模块只做编辑器内的视图/校验/事件来源。
- Node-RED 节点、总线、部署生命周期在 Node-RED 宿主；Node-RED 可注册 `scope`（flow/global）
  或自己的事件属性，kit 不需要改动。
- SCXML 导出用 `data-kit-attrs` / `data-kit-event-attrs` 保留属性；标准 SCXML 工具会忽略。
