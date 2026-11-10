# statechart-kit

状态图（statechart）的建模与运行工具集：文档模型、SCXML 序列化与导入、命名规则、会话驱动。

> **边界声明**：本包**生成并驱动** SCXML，但**不解释** SCXML。
> 解释器与渲染器是 [`@tinyactors/scxmljs`](https://www.npmjs.com/package/@tinyactors/scxmljs)，本包是它上面的一层。

```
        你的应用 / Node-RED 节点 / 编辑器宿主
                        │
                  statechart-kit          ← 本包：文档模型、序列化、导入、命名、会话驱动、编辑器 UI
                        │  输出 SCXML / 驱动会话
                        ▼
              @tinyactors/scxmljs         ← 依赖：SCXML 1.0 解释器 + <scxml-view> 渲染器
```

## 属于本包 vs 不属于本包

| 属于本包 | 不属于本包（留在各宿主） |
| --- | --- |
| 状态图文档模型 `ProjectDoc` | 全局变量注册表 |
| SCXML 序列化 / 导入 / 结构校验 | MQTT 桥与规则 |
| 命名规则（可注入策略） | 服务端时钟、事件路由 |
| 会话运行与回放控制 | REST 接口 / 持久化 |
| 编辑器 UI（P3 起） | Node-RED 节点与事件总线 |

## 状态：P0 —— 逐字快照

当前版本是 `scxml-creator` 的**逐字快照**，不含任何行为改动：

- `src/core`：来自 donor `src/core`，快照 commit `6b5cfb6`
- `src/engine`：来自 donor `src/engine`，快照 commit `cb00cfa`
- `test/*`：来自 donor `scripts/`，三个纯逻辑验证脚本

快照的字节一致性由 `npm run check:baseline` 保证，出处记录在 [`docs/baseline.json`](docs/baseline.json)。

**P1 会改变公开 API**（`NamingPolicy` 注入、校验分层、文案 code 化），因此 `0.x` 期间不承诺向后兼容。

## 安装与使用

```sh
npm install statechart-kit
```

```ts
import { emptyDoc, serializeToScxml } from 'statechart-kit'
import { SessionRunner } from 'statechart-kit/engine'

const doc = emptyDoc('demo')
// ... 编辑 doc ...
const xml = serializeToScxml(doc)   // 交给 @tinyactors/scxmljs 运行
```

| 入口 | 内容 | 运行时依赖 |
| --- | --- | --- |
| `statechart-kit` | 文档模型、序列化、导入、命名、日志类型 | 无 |
| `statechart-kit/engine` | `SessionRunner`（会话生命周期、回放、变量快照） | `@tinyactors/scxmljs` |

## 开发

```sh
npm install
npm run typecheck     # tsc --noEmit
npm test              # 三个纯逻辑验证套件
npm run build         # tsup → dist（ESM + d.ts）
npm run verify:all    # 类型 + 测试 + 构建 + 基线 + 打包冒烟
```

| 命令 | 作用 |
| --- | --- |
| `npm run freeze:baseline` | 重新冻结快照哈希与 donor 出处（仅在同步 donor 后执行） |
| `npm run check:baseline` | 校验本仓仍与基线一致；加 `-- --donor` 可额外逐字节比对 donor 工作区 |
| `npm run check:pack` | 打包后在临时目录按 exports map 真实导入一次，验证发布物可用 |

## 版本策略

- 语义化版本；`0.x` 期间 minor 可含破坏性变更，破坏性变更必须写进 `CHANGELOG.md`。
- 消费方（`scxml-creator`、`node-red-contrib-scxmljs`）应在同一时间 pin 同一版本，避免快照漂移。
- 每个阶段的完成点打 tag：`v0.1.0` = P0 快照基线。

## 路线图

见 [`docs/roadmap.md`](docs/roadmap.md)。

## License

MIT
