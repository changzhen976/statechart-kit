# P2 架构梳理与隐患处理

- 日期：2026-11-10
- 范围：`statechart-kit` 的 core / engine 边界、会话生命周期、引擎加载与 P2 选项
- 结论：P2 的四项功能（`scriptTimeoutMs` / `maxMicrosteps` / `data` 预置 / trusted-sandboxed 选择）
  已落地；同时修复了 15 处会在 P3–P5 放大的隐患。剩余 6 项已明确归属与触发条件，转入 P5 前处理。

## 1. 当前分层

```
┌──────────────────────────────────────────────────────────────┐
│ 宿主：scxml-creator（P4） / node-red-contrib-*（P5）          │
│  - 持久化、MQTT、路由、i18n、Node-RED 节点                    │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│ statechart-kit/engine                                        │
│  SessionRunner        会话生命周期 / 回放 / 事件桥            │
│  engine-loader        按 mode 懒加载 + 选项规范化             │
│  validator            validateScxml / validateDocument       │
└───────────────┬──────────────────────────────────────────────┘
                │ 动态 import（sandboxed | trusted）
┌───────────────▼──────────────────────────────────────────────┐
│ @tinyactors/scxmljs  /  @tinyactors/scxmljs/trusted           │
└──────────────────────────────────────────────────────────────┘

statechart-kit（core，零运行时依赖）
  model / serializer / scxml-import / naming / event-catalog /
  active-tree / validate-structure / serialize-checked / log
```

约束仍然成立：

- core 不 import 引擎；`validateStructure`、`serializeChecked`、`buildDirectionCatalog` 均可单独使用。
- `statechart-kit/engine` 也**不再静态 import** 任一引擎实现：模块加载本身不触发 QuickJS/WASM，
  也不强制加载 trusted；首次 `start()` / `validateScxml()` 才按需 import。
- 命名策略、诊断 code、服务端语义仍按 P1 的边界：core 只给 `BASE_POLICY`，服务端预设在
  `statechart-kit/policies/server`。

## 2. 隐患清单与处理

| ID | 位置 | 隐患 | 级别 | 处理 |
| --- | --- | --- | --- | --- |
| R1 | `SessionRunner.start` | 并发 `start` 各自创建会话：后完成的覆盖先完成的，旧会话与监听器泄漏 | 高 | 引入 `generation` 令牌；`stop()` 递增令牌，迟到的 `start` 创建完成后立即 `dispose`，不安装 |
| R2 | `SessionRunner.start` | 旧实现先 `await createSession` 再赋值字段；`stop` 在加载窗口内无效 | 高 | 同上；创建前/后各检查一次令牌，`stop` 对进行中的 start 生效 |
| R3 | `SessionRunner` 事件 | 只保存了 `removeEventListener` 闭包，**忘记 addEventListener**（P2 重写时发现） | 高 | 补齐 6 个 add；新增“启动只派发一次 active”断言，防止回归 |
| R4 | `SessionRunner` | 引擎加载失败/非法 SCXML 后可能留下 clock、监听器或半初始化状态 | 中 | `create` 失败 `clock.dispose()`；`start()` 抛错走 `disposeCurrent()`；测试断言回到 idle |
| R5 | `SessionRunner` | 初始 `macrostep` 已由引擎派发，旧代码又手动 `onMacro()`，`active` 事件重复 | 中 | 只信任引擎事件；仅空图等未派发场景兜底一次，测试断言 `activeCount === 1` |
| R6 | `SessionRunner` | 宿主监听器抛错会中断同一事件的其他监听器，甚至冒泡进引擎 | 中 | `emit` 逐个 try/catch；新增 `onListenerError` 钩子；hook 自身抛错也被吞 |
| R7 | `SessionRunner` | 旧会话在 stop/重启后仍可能派发 macrostep/log，污染新会话 UI | 中 | 每个监听器先做 `session === this.session && generation` 过滤 |
| R8 | `SessionRunner` | 默认只能 sandboxed；trusted 宿主被迫静态 import，体积/初始化成本不可选 | 高 | 新增 `engine-loader`，按 `'sandboxed' \| 'trusted'` 动态 import；默认 sandboxed |
| R9 | 引擎加载器 | 两套入口各自 import，validator 又单独静态 import trusted，缓存分散 | 中 | 合并为唯一 loader：`loadEngine` / `preloadEngine` / `createEngineSession` / validator 共用，按 mode 缓存 |
| R10 | 引擎加载器 | 动态 import 失败后 Promise 永久缓存，后续所有启动都失败 | 低 | `catch` 时删除缓存，允许重试；QuickJS 内部缓存无法重置，已在文档说明 |
| R11 | `SessionRunner` | `scriptTimeoutMs` / `maxMicrosteps` / `data` 没有通道；非法值直接丢给引擎 | 高 | 新增构造器选项 + `StartOptions.data`；loader 统一校验正数/整数，非法抛 `RangeError`/`TypeError` |
| R12 | `SessionRunner.assignVariable` | 用 `any` 访问 datamodel，返回中文 `message`，宿主只能字符串手术 | 中 | 改用 typed `session.datamodel`；返回 `{ ok, code, params }`（`variable.*`） |
| R13 | `serializeToScxml` | 容忍策略会静默写出悬空端点/非法 id；宿主若直接交给运行时，错误被推迟到引擎 | 中 | 新增 `serializeChecked(doc)`：结构 error 抛 `DocumentStructureError`（含 issues）；默认序列化保持兼容 |
| R14 | `scxmlToDoc` / `validateScxml` / `createEngineSession` | Node 无全局 `DOMParser` 时抛 `ReferenceError`；happy-dom 对 script CDATA 解析失败，含 JS 的合法文档校验/启动被误判 | 中 | 无解析器抛 `ScxmlImportError('import.no-dom-parser')`；抽出 `neutralizeCdata`，导入/校验/建会话统一中和 CDATA |
| R15 | `SessionRunner` 控制 | idle 时 `pause/play/step` 仍写“已暂停/继续/单步”误导日志；NaN 速度进入时钟 | 低 | idle no-op；速度负数/NaN 归零；`send` 返回布尔 |

## 3. P2 选项语义

| 选项 | 作用域 | 默认 | 说明 |
| --- | --- | --- | --- |
| `engine` | sandboxed / trusted | `sandboxed` | trusted 只用于完全可信的图表；可触达宿主 JS |
| `scriptTimeoutMs` | sandboxed | 引擎 2000 | 单次表达式/脚本求值中断；trusted 忽略 |
| `memoryLimitBytes` | sandboxed | 引擎 64 MiB | QuickJS 会话内存上限；trusted 忽略 |
| `maxMicrosteps` | 两者 | 引擎 100000 | 单个宏步上限；超出后 `error.platform` 并停止 |
| `data` | 两者 | 无 | start 前覆盖 `<data>` 初始值；`start()` 的 data 浅合并覆盖构造器 |
| `domParser` | Node | 无 | Node 必须注入；浏览器可省 |

`data` 刻意放在 `createSession` 的 `SessionOptions.data`，而不是 start 后 `assignValue`：后者会先跑
initial macrostep/entry，再改变量，既可能触发错误转移，也不符合“恢复现场再启动”的语义。

## 4. 加载器设计

```ts
loadEngine(mode)        // 只 import；同一 mode 并发共享 Promise；失败可重试
preloadEngine(mode)     // import + sandboxed 预热 QuickJS
createEngineSession(s)  // 校验选项 + 选择入口 + 中和 CDATA + createSession
```

- 每个 mode 一个缓存项；两个入口互不干扰。
- `PlaybackClock` 从会话所属入口取，`SessionRunner` 模块本身不静态依赖任一实现。
- validator 复用 `loadEngine('trusted')` 的 `parseSCXML/compile`，不另建缓存。
- 打包后 `dist/engine.js` 只剩 `import('@tinyactors/scxmljs')` / `import('@tinyactors/scxmljs/trusted')`
  两条动态 import；`check:pack` 在真实解包目录里验证。

## 5. 剩余风险（接受/延后）

| ID | 风险 | 处理计划 |
| --- | --- | --- |
| D1 | `SessionRunner` 的运行日志（lifecycle/send/error）仍是自由中文文本 | P5 切 Node-RED 时按宿主语言/日志通道改造；`SimLogEntry` 保持结构不变 |
| D2 | 引擎 `error.*` 的 `message` 是上游英文文本，放在 `params.detail` | 宿主按 code 本地化摘要；detail 只作排障原文 |
| D3 | `serializeToScxml` 默认仍容忍半成品文档 | 编辑器预览继续用默认；部署/运行路径改用 `serializeChecked`（P4/P5 接线） |
| D4 | trusted 模式不是安全沙箱 | 只在宿主明确选择时使用；默认 sandboxed，README/选项注释标注 |
| D5 | QuickJS 内部 `modulePromise` 失败后无法重置 | 上游行为；loader 只能恢复 ESM 缓存。宿主可将首次失败上报为启动错误，重启进程 |
| D6 | 同一包被 bundler 复制成多份时，各自有 loader 缓存 | 构建侧去重；不属于运行时 API 能解决的问题 |

## 6. 验证

- `npm test`：7 个套件（P0 3 + P1 3 + P2 1）
- P2 新增 38 条断言：loader 共享/预热/非法选项、两种数据模型的 data 预置、生命周期竞态、
  监听器隔离、timeout/microsteps、变量 code、无静态引擎 import 守卫
- 新增/更新：`serializeChecked`、`import.no-dom-parser`、CDATA 中和后含 script 文档的引擎校验
- `npm run check:pack`：core / engine / policies 三入口真实导入
