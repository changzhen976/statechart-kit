# 0.8 新增宿主事件

`SessionRunner` 向宿主暴露的 typed 事件。该契约只透传引擎事实，不包含宿主过滤策略。
`active` / `fired` / `log` / `stopped` 沿用 0.7.x 的语义，不在此表重复。

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
| `done` | `data` | 顶层 final 的 donedata；引擎 `status='done'`，`runner.running` 仍为 true 直到 stop |
| `error` | `kind`, `message` | SCXML 错误事件；不一定是致命错误，图表仍可 transition on `error.*` |

## 边界

- 广播策略不在 kit：是否将事件发送给其他机器由宿主根据 `target`/`sendid` 判断。
- 匿名延时 `<send delay>` 没有 `sendid`；需要可靠过滤时，生成动作应带 `id`。
- `sendType` / `error.element` 暂不在公共契约中；需要时再以可选字段扩展。
- `RunnerEvent` 新增成员会让使用 `never` 穷举的 switch 编译失败，这是有意的 minor 变更。
- `start()` 失败仍抛异常，不额外发 typed `error`。

测试：`npm run test:host-events`。
