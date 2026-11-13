# 会话 typed 事件

`SessionRunner` 向宿主暴露的 typed 事件。该契约只透传引擎事实，不包含宿主过滤策略。
`active` / `log` / `stopped` 等生命周期事件仍在 `RunnerEvent` 联合类型中，此处只列
需要宿主稳定消费的 send/done/error 契约。

```ts
import type {
  RunnerSendEvent,
  RunnerDoneEvent,
  RunnerErrorEvent,
} from 'statechart-kit/engine'
```

| 事件 | 字段 | 说明 |
| --- | --- | --- |
| `send` | `name`, `data`, `target`, `sendid?` | 每次 `<send>` 恰好一次；`target` 默认 `''` |
| `done` | `data`, `states` | 顶层 final 的 donedata + 进入终态的最后一批状态 |
| `error` | `kind`, `message`, 可选定位字段 | SCXML 错误事件；不一定是致命错误 |

## `done`

```ts
interface RunnerDoneEvent {
  type: 'done'
  data: unknown
  states: string[]
}
```

- `data` 是顶层 final 的 `<donedata>`；无 donedata 时为 `undefined`；
- `states` 至少包含顶层 final 的 id；parallel/nested 场景取最后一次 microstep 的
  `entered` 状态；
- runner 在 `done` 前会发一次终态 `active`；`done` 之后不再发空 `active: []`；
- `status='done'` 后 `runner.running` 仍为 true，直到 `stop()`。

## `error`

```ts
interface RunnerErrorEvent {
  type: 'error'
  kind: 'error.execution' | 'error.communication' | 'error.platform'
  message: string
  stateId?: string
  transitionId?: string
  slot?: 'entry' | 'exit' | 'transition'
  actionIndex?: number
  element?: { localName: string; id?: string }
}
```

定位字段能取到才填，不会强行伪造：

- `stateId`：最近的 `state` / `parallel` / `final` / `history` id；
- `slot`：`onentry` / `onexit` / `transition`；
- `actionIndex`：出错元素在动作容器中的序号；
- `transitionId`：只对自产 SCXML 可靠，序列化器会写 `data-kit-transition-id`；
- `element`：可序列化的 DOM 描述，宿主不需要持有基类 `Element`；
- 定位实现只依赖 DOM Level 1（`parentNode` / `childNodes` / `nodeType`），不要求
  `Element.closest()`，因此 Node 的 `@xmldom/xmldom` 也可用。

`start()` 失败仍抛异常，不额外发 typed `error`。`error.*` 事件不一定是致命的，
图表仍可继续 transition。

## 边界

- 广播策略不在 kit：是否将事件发送给其他机器由宿主根据 `target`/`sendid` 判断。
- 匿名延时 `<send delay>` 没有 `sendid`；需要可靠过滤时，生成动作应带 `id`。
- `RunnerEvent` 新增成员会让使用 `never` 穷举的 switch 编译失败，这是有意的 minor 变更。
- `send()` 仍返回 boolean；需要区分失败原因时等后续 `trySend`（KIT-011）。

测试：`npm run test:host-events`。
