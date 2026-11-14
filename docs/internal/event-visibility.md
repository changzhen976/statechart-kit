# 事件可见性：仅内部事件（internal-only）

> 状态：**Draft — 目标 0.15**
> 发布线：`0.13.1` 之后**直接发布 0.15.0**；`0.14.0` 不发布（tag 仅本地，未推送）。
> 本文是「事件可见性 / 仅内部事件」语义的**单一事实源**：模型、序列化、校验、
> 编辑器交互与迁移规则以本文为准。用户操作步骤见
> [`docs/editor.md`](../editor.md)，宿主类型见
> [`docs/host-integration.md`](../host-integration.md)，诊断 code 见
> [`docs/messages.md`](../messages.md)。
> 图例：`[已实现]` = 代码已在 main（含未发布的 0.14.0）；`[待实现]` = 目标
> 0.15；`[待决策]` = 尚未拍板。

---

## 0. 摘要

- 事件只有两种：**默认双向**；只有显式列入 `internalOnlyEvents` 的事件是**仅内部**。
- internal-only 不是消费端的一个开关，而是**生产端 + 消费端的一致性不变量**：
  - 生产端：该事件的所有生产者必须是 internal 类型（`raise`，或
    `send … target="#_internal"` 且不带 delay）；
  - 消费端：监听该事件的转移必须全部是 internal-only 事件（否则是不合法的混合
    转移，不生成守卫）。
- 延时不由动作编辑器提供；延时只有转移上的 `delayMs`（`after` 语义，**单次**）。
  需要“到点后触发一个内部事件”时，用 `raise` 中继。
- 自定义 JS **不能发事件、不能做定时器**；事件必须来自动作行。
- 校验会报出生产者冲突、混合事件、不可用的内部延时写法；`serializeChecked`
  拒绝 error 文档。
- 勾选「仅内部」时弹出**定义/约束对话框**；存在冲突时不允许确认。

一句话规则：**只有生产端全 internal、消费端全 internal-only 的事件，才允许被标成仅内部。**

---

## 1. 背景与目标

### 1.1 0.14 代码现状（未发布）

- 0.14.0 的代码已合入 `main`，但**从未推送 tag / 发布 npm**；`external-only`
  从未对外提供。
- `EventVisibility = 'both' | 'internal' | 'external'`，文档字段
  `ProjectDoc.eventVisibility?: Record<string, EventVisibility>`。
- `external` 在 0.14.0 代码中新增，守卫为 `_event.type === 'external'`。
- 事件面板的「接收事件」是三选一下拉：双向 / 仅内部 / 仅外部。
- 动作编辑器仍提供「延时发送」，即 `send <event> delay 3s id <event>`。
- `delayMs` 转移由序列化器注入 `send … delay`，自动事件不参与可见性守卫。
- 自定义 JS 动作按 `<script>` 原样保留。

### 1.2 要解决的问题

1. **`send … delay` + 仅内部 = 静默死**。`<send delay>` 在引擎里是 external，
   internal 守卫会把它挡掉；`validateStructure` 没有任何提示。
2. **`send target="#_internal" delay …` 当前引擎直接丢弃**（实测：带/不带 `id`
   都不派发），不能作为“内部延时”的实现路径。
3. **`external` 名不副实**。它挡的是 `raise`，放行本机 `send`、延时 send 和
   自动延时；并不等于“只允许宿主外部注入”。
4. **混合事件静默绕过**。`event="a b"`（`a` 仅内部）不生成守卫，外部注入 `a`
   照样触发；0.14 只给 warning。
5. **`eventVisibility` 往返有损**。混合事件、无监听者、自动延时事件的配置在
   serialize → import 后丢失（0.14 只在转移上写 `data-kit-visibility`）。
6. **自定义 JS 不在事件目录/校验视野内**，且实测根本无法发事件，容易被误用。
7. **事件改名丢配置**：`eventVisibility` 会被当成孤儿清掉，`eventAttrs` 却留下
   孤儿键；同一功能两套策略。

### 1.3 目标

- 可见性模型收敛为「双向 / 仅内部」，语义可一句话解释。
- internal-only 在**生产端**就可校验，冲突在编写时与校验时都能报出来。
- 延时只有一种作者入口（转移上的 `delayMs`），不再产生无法满足的可见性组合。
- 配置可往返、改名可迁移、诊断可定位。
- 勾选「仅内部」时有一次明确的定义/约束确认。

### 1.4 非目标

- 不做“仅宿主 / host-only”来源过滤：`_event.type` 只有 internal/external 两档，
  标准 SCXML 无法区分“宿主注入”和“本机 send”。
- 不引入私有事件、不可猜测事件名或引擎侧 `after` 类型；事件名在 SCXML 中仍然可见。
- 不修改 `@tinyactors/scxmljs`；不对上游行为做承诺。
- 不把可见性当安全边界（见 §2.5）。

### 1.5 设计原则

1. **少状态**：能用一个「仅内部」集合表达的，不做三态。
2. **生产端一致**：可见性必须能追溯到“谁发出它”。
3. **单一事实源**：UI、校验、序列化共用 `docEventFacts` 的通道判定。
4. **可诊断**：任何会静默失效的组合都必须有 code。
5. **可迁移**：旧文档、旧 SCXML 有确定的降级/转换路径。
6. **UI 与运行时同源**：仿真注入判断与序列化守卫使用同一规则。

---

## 2. 术语与事件类型

### 2.1 可见性

| 值 | 含义 | 序列化行为 |
| --- | --- | --- |
| 双向（默认） | 任何 `_event.type` 都可以触发 | 不写守卫 |
| 仅内部 | 只允许 internal 类型触发 | 转移加 `cond="_event.type === 'internal'"` |

0.15 起**删除「仅外部」**。旧文档/旧 SCXML 中的 `external` 按 §4.3 降级为双向。

### 2.2 生产者类型表 `[已实现，事实基准]`

“生产者”指在文档内产生该事件的写法。`_event.type` 的实测环境：
`SessionRunner({ engine: 'trusted' })`，0.14.0。

| 生产者写法 | `_event.type` | 可作 internal-only 生产者 | 备注 |
| --- | --- | --- | --- |
| `raise <e>` | internal | ✅ | 不带 data |
| `send <e> target="#_internal"`（无 delay） | internal | ✅ | 可带 data，`_event.data` 可用 |
| `send <e>`（无 target） | external | ❌ | 本机 send 仍是 external |
| `send <e> delay …` | external | ❌ | 定时器死锁的根源 |
| `send <e> target="#_internal" delay …` | 引擎丢弃 | ❌ | 直接报错，禁止生成 |
| `delayMs` 转移的自动 `send` | external | ❌ | 自动事件隐藏，且不参与守卫 |
| 引擎产生的 `done.state.*` / `done.invoke.*` / `error.*` | 由引擎决定 | 不纳入扫描 | 见 §5.6 |
| JS 中的 `send()` / `raise()` | 不存在 | ❌ | 实测 `ReferenceError`，见 §8 |

### 2.3 internal-only 的定义

事件 `e` 可以标成仅内部，当且仅当：

1. `docEventFacts(doc).sendOrigins.get(e)` 的每一项 `channel === 'internal'`
   （`raise` 或 `send target="#_internal"`，且无 delay）；
2. 所有监听 `e` 的转移，其事件列表里**只有** internal-only 事件（或只有 `e`）；
3. 不存在 `send target="#_internal" delay …` 这种引擎不支持的写法。

不满足 1 或 3 → 生产端 error；不满足 2 → 混合事件 error。两者都在 §5 定义。

### 2.4 定时器语义 `[已实现]`

`delayMs` 转移 = SCXML `after` 语义：

- 源状态 **entry** 布防（`cancel` 旧 sendid + `send … delay`），**exit** 撤销；
- **单次**触发；无目标转移不退出源状态，因此**不会自动重布防**；
- 只有源状态被重新进入（自环、离开再回来、父状态重入）才重新布防；
- `cond` 在触发时为 false → 本次不触发，也不会重试/重布防；
- 周期任务必须靠重入实现（自环 `delayMs`，或“闹钟 + 业务自环”）。

实测（30 ms 延时，观察 120 ms）：无目标 `delayMs` 触发 1 次；自环 `delayMs`
触发 3 次；无目标闹钟 + 业务自环触发 3 次。写法见 §6.4。

### 2.5 安全边界

- internal-only 只是 SCXML 守卫：拦截宿主 `SessionRunner.send()` 注入的外部事件。
- 事件名仍在 SCXML 中可见；能修改 XML 或直接操作引擎的宿主不受此约束。
- 不是权限、认证或数据隔离机制；敏感数据的保护必须在宿主/服务端完成。

---

## 3. 数据模型

### 3.1 字段 `[待实现]`

```ts
export interface ProjectDoc {
  // …现有字段
  /**
   * 仅内部触发的事件名。
   * - 缺省 / 空数组 = 全部双向；
   * - 名称去重、去空白；按名称排序存储，保证输出稳定；
   * - 只允许 internal 生产者（见 §5）。
   */
  internalOnlyEvents?: string[]
}
```

- 删除 `EventVisibility` 类型与 `ProjectDoc.eventVisibility`。
- 空数组在 `normalizeDoc` 中删除，保持 JSON 干净。
- 排序规则：按名称的 UTF-16 code unit 升序（`a < b`），避免
  `localeCompare` 受宿主 locale 影响；UI 展示可另行排序。

### 3.2 API `[待实现]`

```ts
export function isInternalOnlyEvent(doc: ProjectDoc, event: string): boolean
export function internalOnlyNames(doc: ProjectDoc): readonly string[]
export function setInternalOnlyEvent(doc: ProjectDoc, event: string, on: boolean): void
```

- `setInternalOnlyEvent`：trim、空名忽略、去重、排序；`on=false` 时删除；
  数组为空时删除字段。
- 删除：`setEventVisibility`、`EventVisibility`、`EXTERNAL_EVENT_GUARD`、
  `stripExternalGuard`、`isExternalOnlyEvent`、`isExternalOnlyTransition`。
- 保留：`withInternalGuard` / `stripInternalGuard`（导入与画布匹配仍需要）；
  `stripVisibilityGuard` 可保留为内部导入工具，但不再暴露 external 语义。

### 3.3 旧字段迁移 `[待实现]`

`normalizeDoc`（以及编辑器加载旧 JSON 时）读取旧 `eventVisibility`：

| 旧值 | 新行为 |
| --- | --- |
| `'internal'` | 加入 `internalOnlyEvents` |
| `'external'` | 丢弃（降级为双向）；SCXML 导入路径给 warning |
| `'both'` / 未知值 | 丢弃 |
| 字段为空对象 | 删除 |

- 若同时存在新字段与旧字段：合并 internal 项、去重；旧字段删除。
- 旧 JSON 的 `external` 静默降级是 0.15 的破坏性变更，写在 CHANGELOG；
  SCXML 导入路径必须给 `import.event-visibility-external-removed` warning。
- `internalOnlyEvents` 中的名字即使暂时没有生产者/监听者也保留，由校验给
  “无生产者”warning；不在加载时擅自删除。

### 3.4 改名、净化与定位 `[待实现]`

**事件改名**（`updateTransition` 修改 `event`）：

- 单事件 → 单事件：把旧名在 `internalOnlyEvents` 中的设置迁移到新名；
- 多事件列表变化：不做模糊迁移（避免误标），由校验提示新事件缺少一致性；
- 旧名若仍被其他转移/动作使用，保留其设置；只有“不再被任何生产者或监听者
  使用”时才移除。

**状态 id 改名**（`updateState`）：

- 级联重算 `delayMs` 自动事件名时，如果旧自动名意外出现在
  `internalOnlyEvents` 中，迁移到新名（正常 UI 不应产生这种配置，见 §5.6）。

**清理**：

- `removeState` / `removeTransition` / 改名后，删除“既无生产者、也无监听者”的
  名字；
- 不在每次无关编辑时清理，避免刚设置、尚未添加生产者时被误删；
- `eventAttrs` 同步迁移键（与 `internalOnlyEvents` 同批实现，见 §9.3），避免宿主
  字段变孤儿。

**校验定位字段**：

给 `StructureIssue` 增加可选字段（与 `ValidationIssue` 对齐，均为增量）：

```ts
event?: string
slot?: 'entry' | 'exit' | 'transition'
actionIndex?: number
```

`structureIssuesToValidation` 透传这些字段；编辑器可以把问题定位到具体事件行
或动作行。没有 `event` 时退回 `transitionId` / `stateId`。

---

## 4. 序列化与导入

### 4.1 根级元数据 `[待实现]`

`internalOnlyEvents` 写在根 `<scxml>` 上，JSON 数组：

```xml
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"
       datamodel="ecmascript" initial="a"
       data-kit-internal-events='["order.timeout","sys.tick"]'>
  …
</scxml>
```

- 只在非空时写；属性值按 XML 规则转义。
- 这是**文档级配置的单一来源**，解决混合事件、无监听者、自动延时事件在往返中
  丢失的问题。
- 数组顺序按 §3.1 排序，保证 `serialize → import → serialize` 逐字节稳定。

### 4.2 转移级元数据 `[待实现]`

- 仍给 internal-only 转移写 `data-kit-visibility="internal"`，便于人读和 0.14
  读取；它是**派生信息**，不是事实源。
- 不再写 `data-kit-visibility="external"`。
- 混合事件（error）不写守卫，也不写元数据。
- 守卫合并规则不变：用户 `cond` 在前，`&& (_event.type === 'internal')` 在后；
  `serializeToDisplayScxml` 隐藏守卫与 `data-kit-visibility`（同时隐藏根级
  `data-kit-internal-events`，避免画布/展示泄露实现细节）。

### 4.3 导入优先级与降级 `[待实现]`

导入顺序：

1. 根级 `data-kit-internal-events` 存在且是合法 JSON 数组 → **以此为准**；
2. 否则，收集所有转移上的 `data-kit-visibility="internal"`（其 `event` 列表
   全部视为仅内部）；
3. `data-kit-visibility="external"` → 剥离外部守卫、**不加入**集合、给
   `import.event-visibility-external-removed` warning；
4. 根级与转移级不一致 → `import.event-visibility-mismatch` warning，根级优先；
   按根级重写转移守卫（剥离 kit 生成的守卫后重新生成）；
5. 根级 JSON 非法 → `import.event-visibility-invalid` warning，退回转移级。

**只剥离 kit 生成的守卫**：带 `data-kit-visibility` 的转移才剥离；用户手写的
`_event.type === 'internal'` 没有 kit 元数据时按用户 `cond` 保留。

### 4.4 往返与展示

- 自产 SCXML 必须满足 `serialize → import → serialize` 逐字节相等（含根级
  数组顺序、转移元数据）。
- `serializeToDisplayScxml` 隐藏：根级数组、`data-kit-visibility`、生成的
  `_event.type` 条件；画布点击匹配继续用剥离后的条件。
- 导入的旧文档若只有转移级元数据，会升级成根级数组 + 转移元数据；再次导出
  以新格式为准。

### 4.5 宿主可用 API

- `isInternalOnlyEvent(doc, name)`：宿主/仿真判断是否拒绝外部注入；
- `docEventFacts(doc)`：审计生产者通道（`internal` / `external` / `auto-delay`）；
- `validateStructure(doc)`：拿到 `{code, params}` 与定位字段；
- `serializeChecked(doc)`：error 文档直接抛 `DocumentStructureError`。

---

## 5. 生产端一致性（核心）

### 5.1 不变量

对每个 `e ∈ internalOnlyEvents`：

```
∀ origin ∈ docEventFacts(doc).sendOrigins[e]:
    origin.channel === 'internal'
且
∀ transition 监听 e:
    transition 的事件列表全部 ∈ internalOnlyEvents
```

第一行是生产端，第二行是消费端（混合事件规则）。任一不成立即 error。

### 5.2 生产者扫描

- 使用 `docEventFacts(doc).sendOrigins` 作为唯一扫描源：
  - `raise` / `send target="#_internal"` → `internal`；
  - 普通 `send`（含 delay） → `external`；
  - `delayMs` 自动 send → `auto-delay`。
- 例外：`send target="#_internal"` **带 delay** 被 `docEventFacts` 标为
  internal，但引擎会丢弃。校验必须额外扫描动作原文，命中即报
  `structure.action.internal-delay-unsupported`。
- 自定义 JS 不扫描：实测无法发事件（§8）；若宿主自行扩展了事件 API，属宿主
  私有扩展，kit 不承诺识别。
- 引擎产生的 `done.state.*` / `done.invoke.*` / `error.*` 不在扫描范围（§5.6）。

### 5.3 校验规则与 code `[待实现]`

| code | 级别 | params | 定位 | 说明 |
| --- | --- | --- | --- | --- |
| `structure.event.internal-only-with-external-producer` | error | `{ event, channel }` | `event` + 生产者位置（state/slot/transitionId/actionIndex） | 每个外部生产者报一条 |
| `structure.event.internal-only-without-producer` | warning | `{ event }` | `event` | 无任何生产者；引擎保留名除外 |
| `structure.action.internal-delay-unsupported` | error | `{ event }` | state/slot/actionIndex 或 transitionId/actionIndex | `#_internal + delay` |
| `structure.transition.mixed-event-visibility` | **error（0.14 为 warning）** | `{ id, events }` | `transitionId` | 混合 internal-only 与双向 |
| `import.event-visibility-external-removed` | warning | `{ event }` | — | 导入旧 external |
| `import.event-visibility-mismatch` | warning | `{ root, transition }` | — | 根级与转移级不一致 |
| `import.event-visibility-invalid` | warning | `{ detail }` | — | 根级 JSON 非法 |

- `serializeChecked` 对任一 error 抛错；编辑器可继续预览半成品。
- `structure.event.internal-only-without-producer` 只对用户事件生效，不报
  `done.state.` / `done.invoke.` / `error.` 前缀。
- `params` 只能放扁平值（`Record<string, string | number>`）；多个生产者就报多条，
  每条带 `stateId` / `transitionId` / `event` / `actionIndex` 定位。

### 5.4 混合事件

一条转移的 `event` 可以包含多个空格分隔的事件名。规则：

| 事件列表 | 守卫 | 结论 |
| --- | --- | --- |
| 全部 internal-only | 加 internal 守卫 | ✅ |
| 全部双向（或没有事件） | 不加 | ✅ |
| internal-only 与双向混用 | 不加 | ❌ error |

- 不自动拆分。拆分涉及动作复制、转移 id、撤销粒度与 undo，交给作者决定；
  以后可做“自动拆分”快速修复。
- 通配 `event="*"` 可以设为 internal-only（表示“只接内部事件”）；与其它事件
  混用同样报 mixed error。
- 无事件转移（eventless）不参与可见性。

### 5.5 修复路径

| 冲突 | 推荐修复 |
| --- | --- |
| 普通 `send e` | 改成 `send e target="#_internal"`（仅当原本没有外部 target） |
| `send e delay …` | 改成「无目标 delayMs + `raise e`」中继，或把 e 改回双向 |
| `delayMs` 自动事件被标仅内部 | 删除该设置；用中继保护业务事件 |
| 混合事件转移 | 拆成多条转移，或取消 internal-only |
| `#_internal + delay` | 删除 delay；延时用 delayMs 中继 |

编辑器一键修复只做**无歧义**的第一种；其余给出说明与定位，不自动改图。

### 5.6 自动延时与引擎事件

- `delayMs` 自动事件名（`delay<N>…`）不出现在可见性 UI 中，也不应出现在
  `internalOnlyEvents` 里；导入文档若包含，按 auto-delay 生产者报 conflict error。
- 引擎产生的 `done.state.*` / `done.invoke.*` / `error.*`：kit 不知道其
  `_event.type` 细节，不纳入生产者扫描；用户若把它们设为仅内部，由引擎语义决定
  是否触发。无生产者 warning 对这些前缀豁免。

---

## 6. 正确写法

### 6.1 新增一个仅内部事件的标准流程

1. **先加生产者**：在状态 entry/exit 或转移动作里加 `raise <e>`（需要数据时用
   `send <e> target="#_internal" data …`）。
2. **再加消费者**：新增一条 `event="<e>"` 的转移；一条转移只放这个内部事件，
   或全部放 internal-only 事件。
3. **勾选「仅内部」**：事件面板接收行 → 复选框；在弹窗中确认（§7.2）。
4. **校验**：`validateStructure` / 编辑器「校验」应无 error；外部注入 `e` 应被
   仿真拒绝。
5. **部署**：`serializeChecked(doc)`；确认生成的转移带
   `cond="_event.type === 'internal'"`。

### 6.2 立即内部事件

```text
raise sys.tick
```

带数据（`raise` 不带 data）：

```text
send sys.tick target #_internal data {"v":1}
```

实测：`#_internal` 立即发送产生 internal 事件，`_event.data` 在监听转移里可读。

### 6.3 单次内部延时

```text
# 状态内：无目标转移，延时 3s，只负责 raise
transition (target 为空, 延时 3s)  actions: raise sys.tick

# 业务转移：监听 sys.tick，设为仅内部
transition sys.tick → timeout
```

- 到点触发一次；`cond` 为 false 时本次不触发且不重试；离开状态撤销，回来重新计。
- 不要写成 `send sys.tick delay 3s`。

### 6.4 周期内部定时器

两种等价写法：

```text
# A. 自环 delayMs：每次触发退出重入 → 重布防
transition (target = 源状态, 延时 3s)  actions: raise sys.tick

# B. 无目标闹钟 + 业务自环
transition (target 为空, 延时 3s)  actions: raise sys.tick
transition sys.tick → 源状态 (自环)   # 重入 → 重布防
```

- 二者都会重跑源状态的 entry/exit 动作；有副作用的 entry 动作要挪走或接受重复。
- 实测：30 ms 延时、观察 120 ms，自环与“闹钟 + 业务自环”都触发 3 次。
- 需要“条件不满足继续等”时，保证每个 tick 都有一条兜底自环被选中，否则循环停止。

### 6.5 带 payload 的延时

```text
entry: send arm delay 3s id arm data {"orderId":"A1"}

transition arm (target 为空)  actions:
  assign pending = _event.data.orderId
  raise sys.tick

transition sys.tick → timeout      # 仅内部
```

- `arm` 是 transport 事件，永远不要设仅内部；`sys.tick` 才是业务内部事件。
- `raise` 不带 data；payload 用变量传递，消费者读变量。
- `_event.data` 在转移动作里可用（实测）。

### 6.6 反例

| 写法 | 问题 |
| --- | --- |
| `send timer delay 3s id timer` + `timer` 仅内部 | external 被 internal 守卫挡住，永不触发 |
| `send timer delay 3s target #_internal` | 引擎丢弃该事件 |
| `raise go` + `go` 仅外部（0.14） | raise 被 external 守卫挡住 |
| `event="a b"`，`a` 仅内部 | 不生成守卫，外部可注入 `a` |
| JS `send('go')` / `raise('go')` | 未定义；不会产生事件 |
| 用 `setTimeout` 做定时 | 脚本里不存在；即使宿主注入也不受会话时钟/退出撤销管理 |

### 6.7 写法对照表

| 写法 | 事件类型 | 可设仅内部 | 触发次数 |
| --- | --- | --- | --- |
| `raise e` | internal | ✅ | 每次执行一次 |
| `send e target #_internal` | internal | ✅ | 每次执行一次 |
| `send e` | external | ❌ | 每次执行一次 |
| `send e delay T` | external | ❌ | 单次（到点） |
| `delayMs`（无目标） | external（自动） | ❌（隐藏） | 每次进入源状态一次 |
| `delayMs`（自环） | external（自动） | ❌（隐藏） | 每次重入一次 |

---

## 7. 编辑器交互

### 7.1 可见性控件 `[待实现]`

- 事件面板「接收事件」的可见性列：三选一下拉 → **复选框「仅内部」**。
- 未勾选 = 双向；勾选后写 `internalOnlyEvents`；取消勾选立即移除（不弹窗）。
- 勾选是“提议”而不是立即写入：先打开定义/约束弹窗（§7.2），确认后才落库并
  `captureUndo`。
- 复选框的禁用条件：
  - 事件是自动延时事件（导入残留）→ 禁用并提示“自动延时事件不支持可见性”；
  - 文档只读 / 仿真运行中 → 禁用（现有 locked 规则）。

### 7.2 定义/约束弹窗 `[待实现]`

**触发**：用户勾选「仅内部」时；取消勾选不弹。

**内容**（全部走 labels，zh/en 同步）：

```text
┌─ 仅内部事件 ─────────────────────────────────────────────┐
│ 事件：sys.tick                                            │
│                                                          │
│ 定义                                                     │
│   仅内部事件只允许由本会话内部的 raise / send #_internal  │
│   产生；监听它的转移会加 _event.type === 'internal' 守卫。│
│                                                          │
│ 允许的生产者                                             │
│   ✓ raise sys.tick                                       │
│   ✓ send sys.tick target="#_internal"（不带 delay）      │
│                                                          │
│ 不允许                                                   │
│   ✗ 普通 send（无 target）                                │
│   ✗ send … delay …（引擎里是 external）                   │
│   ✗ delayMs 自动事件                                      │
│   ✗ 自定义 JS 中的 send()/raise()（不存在）               │
│                                                          │
│ 消费者要求                                               │
│   一条转移只能包含仅内部事件；与双向事件混用会报错。      │
│                                                          │
│ 当前扫描                                                 │
│   生产者：left · 进入动作（raise）          ✓             │
│   监听者：t1（单事件）                      ✓             │
│                                                          │
│ 说明：这不是安全边界；事件名在 SCXML 中仍可见。           │
│                                                          │
│                          [取消]  [设为仅内部]             │
└──────────────────────────────────────────────────────────┘
```

**冲突态**：

- 逐条列出外部生产者 / 混合监听者，并显示可用修复：
  - 普通 `send` → 「改为内部发送」（自动加 `target="#_internal"`）；
  - `send delay` → 「查看中继写法」（0.15.0 不自动改图；转换器延后到 0.15.x）；
  - `delayMs` 自动事件 → 「移除可见性」；
  - 混合监听转移 → 「打开转移」（定位后由作者拆分）。
- 有未解决冲突时，「设为仅内部」**禁用**；「取消」始终可用。
- 没有任何生产者时（且不是引擎保留名）：显示 warning“该事件目前没有内部生产者，
  设置后将永远不会触发”，但仍允许确认（允许先搭骨架）；校验随后给
  `internal-only-without-producer` warning。
- 「本次会话不再提示」：提供，只写内存（编辑器不读 localStorage / 不持久化），
  默认不勾选；勾选后本次会话内再次勾选「仅内部」**不再弹定义框**，但仍执行生产者
  扫描：无冲突直接写入；有冲突仍弹出（冲突不可静默跳过）。

**实现建议**：

- 新增 `InternalEventDialog.vue`，复用 `ConfirmDialog` 的 overlay/dialog 样式；
  不复用 `confirmRequest`，避免把富内容塞进纯文本契约。
- store 增加 `internalEventDialog` 状态与 `openInternalOnlyDialog(event)` /
  `confirmInternalOnly()` / `cancelInternalOnly()`；弹窗打开时计算
  `docEventFacts` 与监听者列表，结果缓存到状态里，确认前不写文档。
- `EditorHost.vue` 挂载新组件；`role="dialog"`、`aria-labelledby`、Esc 取消、
  Enter 确认（冲突时 Enter 不生效）、打开时焦点落在主按钮。
- 样式仍集中在 `src/vue/styles.css`（不写 scoped style）。

### 7.3 冲突修复

- 「改为内部发送」：仅对“普通 `send` 且无显式外部 target”的动作行生效；替换
  该行动作字符串为 `send … target #_internal`，保留 delay/id/data（delay 情况
  不走此修复）。修复后重新扫描弹窗。
- 其余冲突只提供定位与说明，不自动改图。
- 修复动作是一次 `captureUndo` 的可撤销编辑。

### 7.4 校验结果与定位 `[待实现]`

- `validate()` 走 `validateDocument`，结构 error 出现在现有校验弹窗。
- `StructureIssue` 新增 `event` / `slot` / `actionIndex`，`locateIssue` 优先：
  1. `transitionId` → 选中转移；
  2. `event` → 选中该事件的第一条监听转移；没有监听转移时打开事件面板并高亮
     对应行（新增 `eventFocus` 状态，参考 `actionFocus` 的实现）；
  3. `stateId` + `slot` + `actionIndex` → 选中状态并聚焦动作行。
- 事件面板可在接收行显示内联警告图标（基于 `docEventFacts` 的轻量扫描）；
  完整校验仍走 `validate()`。内联扫描只提示，不改变 `validate()` 的结论。

### 7.5 仿真

- `sendEvent` 拒绝注入 `isInternalOnlyEvent(doc, name)` 的事件；提示文案不变。
- 由于混合事件已是 error、自动事件不在集合中，仿真判断与序列化守卫同源，
  不再出现“仿真拒绝但引擎可触发”的偏差。
- 中继写法下，注入业务内部事件被拒绝；注入 transport 事件（`arm`）仍可提前
  点火，这是 SCXML 静态事件名的固有限制，文档中说明，不假装拦截。

### 7.6 旧 `send … delay` 行 `[待实现]`

- 移除 `ACTION_KINDS` 的「延时发送」入口；发送行不再提供 delay 输入。
- 导入/旧文档里的 `send … delay …` 行：
  - 只读显示「旧写法 · 延时 3s」，不可直接编辑；
  - 提供「查看中继写法」与「删除」；
  - 不静默丢弃、不允许“看不见但仍在序列化”的隐藏状态。
- **自动转换器延后到 0.15.x**：0.15.0 只做只读 + 文案引导，不自动改图。转换器
  规则先记录在这里，后续按此实现（全部满足才转换）：
  1. 动作位于状态 entry；
  2. `send.event === X` 且 `send.delay` 可解析为 `\d+(ms|s)`；
  3. 无 `data` / `dataExpr` / 外部 target；
  4. `send.id` 为空或等于 X；
  5. 监听 X 的转移全部从同一状态出发，且事件列表只有 X；
  6. 文档内没有其它 X 的 `send`（避免把外部生产者一起改掉）；
  7. 配对的 `cancel X`（若有）只在同一状态的 exit。
  转换结果：删除该 `send` 与配对 `cancel`，在同状态新增一条无目标 `delayMs`
  转移（相同延时），动作 `raise X`；业务转移保持不变。整个转换一次 undo。
  不满足时禁用按钮并显示原因（例如“带 data 的延时发送无法无损转换”）。
- `findDelayedSend` 保留：导入文档仍可能触发“计时器来源”提示。

### 7.7 i18n 与可访问性

- 新增 labels：弹窗标题、定义段落、允许/不允许列表、消费者要求、扫描表头、
  冲突提示、修复按钮、禁用原因；zh/en 同步，禁止硬编码中文。
- 现有面板里的硬编码中文说明（事件面板 meta、EventCombo 分组标题、`⏱ 延时`
  标签）一并迁到 labels。
- 弹窗：`role="dialog"`、标题 `id` + `aria-labelledby`、Esc/Enter、焦点管理、
  按钮 `disabled` 状态可被读屏识别。

---

## 8. 自定义 JS 边界

### 8.1 实测能力表

环境：`SessionRunner({ engine: 'trusted' })`，0.14.0；sandboxed 预期相同
（同为数据模型上下文），未单独断言。

| 能力 | 结果 |
| --- | --- |
| `send('x')` | `ReferenceError: send is not defined` |
| `raise('x')` | `raise is not defined` |
| `window` | `ReferenceError` |
| `setTimeout` | `ReferenceError` |
| `console.log` | 可用 |
| 读/写 datamodel 变量 | 可用 |
| 转移动作里的 `_event` | 可用（`_event.name` / `_event.data`） |
| 转移触发的目标 entry 里的 `_event` | 可用 |
| 初始 entry（无触发事件）里的 `_event` | `undefined`，读取会抛错 |

### 8.2 规则

1. **JS 不发事件**：事件只能由 `raise` / `send` 动作行产生。
2. **JS 不做定时器**：延时只用 `delayMs`；不要用宿主注入的 `setTimeout`（即使
   存在，也不受会话时钟、退出撤销、虚拟时钟管理）。
3. **JS 不拼动态事件名**：kit 无法静态识别，事件目录/校验/可见性都覆盖不到。
4. **JS 只做计算/赋值/日志**；需要条件发事件时，用 `assign` 算变量 + 多条
   `raise` 行。
5. `_event` 只在“由事件触发的执行内容”里可用；entry/exit 里使用前必须
   `typeof _event !== 'undefined'` 判断，或干脆不用。
6. `raise` 不带 data；payload 用变量或 `send #_internal data` 传递。

### 8.3 部署与安全

- 自定义 JS 序列化为 `<script><![CDATA[…]]></script>`；内容避免 `]]>`。
- 宿主可用 `scanScriptActions(doc)` 在部署闸门拒绝含自定义 JS 的文档。
- 用户可编辑图表必须 `sandboxed`；`trusted` 不是安全沙箱。
- JS 错误只以运行时 `error.*` 出现，message 不稳定，不能替代校验。
- `Math.random` / `Date` 会使仿真/回放不可复现；控制逻辑不要依赖。
- 长循环会阻塞会话与时钟。

---

## 9. 迁移与兼容

### 9.1 0.15 相对 0.13.1 的变更（0.14.0 未发布）

- **0.14.0 不发布**：其 `trySend`、`#_internal` 发送、内部发出区块保留并进入
  0.15.0；`external-only` 从未对外提供，0.15.0 不包含它。
- `EventVisibility`、`ProjectDoc.eventVisibility`、`setEventVisibility` 删除，
  改为 `internalOnlyEvents` / `setInternalOnlyEvent`。
- `external` 相关守卫/API 删除（`EXTERNAL_EVENT_GUARD`、`stripExternalGuard`、
  `isExternalOnlyEvent`、`isExternalOnlyTransition`）；跟踪 `main` 的旧草稿在
  导入时降级为双向 + warning。
- 动作编辑器移除「延时发送」与 delay 输入；模型/解析/序列化/导入**保留**
  `send delay` 支持（用于导入与旧文档）。
- `structure.transition.mixed-event-visibility` 从 warning 升为 error。
- 新增 §5.3 的 code。

版本：`0.15.0`；按仓库约定写 `CHANGELOG.md`。由于 0.14.0 未发布，这不构成
面向 npm 用户的 0.14 → 0.15 breaking，但仍需在 CHANGELOG 说明合并关系。

### 9.2 旧 SCXML

- `data-kit-visibility="external"` → 剥离 external 守卫、不加入集合、warning。
- 只有转移级 internal 元数据、没有根级数组 → 升级为根级数组。
- 根级数组非法 → warning，退回转移级。
- 手写 `_event.type === 'internal'` 且无 kit 元数据 → 作为用户 `cond` 原样保留。

### 9.3 旧 ProjectDoc

- `normalizeDoc` 把 `eventVisibility.internal` 迁入 `internalOnlyEvents`；
  `external` / `both` 丢弃；字段删除。
- 由于 0.14.0 从未发布，这里的“旧 JSON”指跟踪 `main` 的宿主导出的草稿，不是
  npm 公开发布版本；宿主加载时应提示用户重新确认敏感事件。
- `eventAttrs` 随单事件改名迁移；孤儿键在改名/删除时清理。

### 9.4 示例与测试

需要重写的内置示例（`src/core/examples.ts`）：

| 示例 | 现写法 | 目标写法 |
| --- | --- | --- |
| 交通灯 | entry `send timer delay …` + `cancel` | 各状态 `delayMs` 转移（red→green→yellow→red） |
| 延时发送与取消 | entry `send alarm delay 3s` + `cancel` | `delayMs` 转移 + pause 路由 |
| 动作演示（采样循环） | 转移动作 `send 采样 delay 1s` | 无目标 `delayMs` + `raise 采样` + 条件自环 |
| 机器人产线 | 多处 entry `send … delay` + `cancel` | 对应 `delayMs` 转移 |

- `test/smoke-engine.ts` 等 core 测试可继续覆盖 `send delay` 的解析/序列化，
  证明导入兼容未丢。
- `test/verify-event-visibility.ts` 重写：删除 external 用例，新增生产者冲突、
  混合 error、external 导入、根级往返、改名迁移、中继、单次/周期定时器。
- 新增编辑器用例（happy-dom）：弹窗打开/确认/冲突/修复、旧 delay 行只读、
  校验定位、i18n。

### 9.5 版本与发布

- 直接发布 `0.15.0`，承接已发布的 `0.13.1`；`0.14.0` 不发布，发布前删除本地
  `v0.14.0` tag（不要执行 `git push --tags` 把它带出去）。
- `CHANGELOG.md`：0.15.0 条目合并 0.14.0 仍有效的内容（`trySend`、`#_internal`、
  内部发出区块），并说明 external-only 从未发布、0.15 不包含它；新增 code 与
  迁移说明。
- 源码变更后执行 `npm run freeze:baseline`；`../scxml-creator` 不在本任务内修改。
- 发布前 `npm run verify:all` 全绿；发布后按 `docs/internal/releasing.md` 验证
  tarball 与安装探针。
- 发布后把 `AGENTS.md` §2 的“当前发布”改为 0.15.0，并补 §5/§7/§9/§10。

---

## 10. 诊断目录 `[待实现]`

| code | 级别 | 触发条件 | 主要 params |
| --- | --- | --- | --- |
| `structure.event.internal-only-with-external-producer` | error | 仅内部事件存在普通 send / 延时 send / 自动延时生产者 | `event`, `channel` |
| `structure.event.internal-only-without-producer` | warning | 仅内部事件没有生产者（引擎保留名前缀除外） | `event` |
| `structure.action.internal-delay-unsupported` | error | `send target="#_internal"` 带 delay | `event` |
| `structure.transition.mixed-event-visibility` | error（原 warning） | 转移同时含仅内部与双向事件 | `id`, `events` |
| `import.event-visibility-external-removed` | warning | 导入旧 `data-kit-visibility="external"` | `event` |
| `import.event-visibility-mismatch` | warning | 根级数组与转移元数据不一致 | `root`, `transition` |
| `import.event-visibility-invalid` | warning | 根级数组 JSON 非法 | `detail` |

- `docs/messages.md` 增加上述行；`src/core/codes.ts` 同步。
- 中文文案放 `src/diagnostics/zh.ts`；英文由宿主替换。
- `params` 保持扁平；多个生产者报多条 issue。

---

## 11. 测试矩阵

| 层 | 用例 | 套件 |
| --- | --- | --- |
| core 校验 | raise / #_internal 通过；普通 send、send delay、delayMs 冲突；无生产者 warning；`#_internal+delay` error | `test/verify-event-visibility.ts` |
| core 校验 | 混合事件 error；全内部通过；通配 `*` 仅内部 | 同上 |
| core 序列化 | 根级数组、转移元数据、display 隐藏、逐字节往返 | 同上 / `test/verify-import.ts` |
| core 导入 | external 降级 warning；根级优先；非法 JSON；旧 ProjectDoc 迁移 | 同上 |
| core 改名 | 单事件改名迁移；仍被其它使用时不删；eventAttrs 同步 | `test/verify-editor.ts` |
| engine | internal-only 挡宿主注入；raise 通过；中继通过；单次/自环计数 | `test/verify-event-visibility.ts` / `test/verify-timers.ts` |
| JS | send/raise/window/setTimeout 未定义；`_event` 上下文 | 新增脚本用例 |
| editor | 复选框弹窗、冲突禁用、修复、旧 delay 行、校验定位、i18n | `scripts/check-vue.mjs` / `test/verify-editor.ts` |
| 发布 | `verify:all`、`check:pack`、`check:vue`、baseline | CI |

验收：`npm run verify:all` 全绿；0.14 的 external 用例全部删除或改写。

---

## 12. 决策记录

| # | 决策 | 备选（否决原因） | 状态 |
| --- | --- | --- | --- |
| D0 | 0.14.0 不发布，直接 0.15.0 | 先发 0.14：external-only 很快被删，版本噪音；跳过：需清理 tag/CHANGELOG | 已确认 |
| D1 | 只保留「仅内部」，不发布 `external` | 保留 external：名不副实、增加状态与守卫分支 | 已确认 |
| D2 | `internalOnlyEvents?: string[]` | 保留 `eventVisibility` 映射：仍有 third state 与 `both` 噪音 | 已确认 |
| D3 | 混合事件升为 error | 继续 warning：外部可绕过；自动拆分：动作复制/undo 复杂 | 已确认 |
| D4 | 根级 `data-kit-internal-events` | 只靠转移元数据：mixed/无监听/自动事件往返丢失 | 已确认 |
| D5 | 移除 delay 作者入口，保留模型/导入 | 全删模型：SCXML 往返与外来源破坏；保留入口：矛盾写法继续存在 | 已确认 |
| D6 | 勾选仅内部弹定义/约束框 | 仅 tooltip：用户不看；每次校验才提示：太晚 | 已确认（本次新增） |
| D7 | 校验报生产者冲突/混合 | 只靠 UI：导入/程序化文档漏网 | 已确认（本次新增） |
| D8 | 无生产者 warning（引擎名前缀豁免） | 不报：死配置难发现；报 error：搭骨架阶段太严 | 已确认 |
| D9 | 旧 delay 行先只读 + 提示，转换器延后到 0.15.x | 0.15.0 自动全转：data/多监听/外部 target 无法无损，且扩大首版范围 | 已确认（分阶段） |
| D10 | JS 不发事件、不做定时器 | 宿主注入 helper：校验不可见、破坏事件目录 | 已确认 |
| D11 | 弹窗「本次会话不再提示」（仅内存，冲突时仍弹） | 每次都弹：高频操作打断；持久化：编辑器不读 localStorage | 已确认 |

---

## 13. 维护约定

- 本文是单一事实源；**修改语义、诊断、序列化、UI 流程时必须同步本文**。
- 实现落地时：把 `[待实现]` 改为 `[已实现]`，补 `CHANGELOG.md`，更新
  附录 A 的文档与测试。
- 新增 diagnostic code 必须同时更新 `docs/messages.md`、`src/core/codes.ts`、
  `src/diagnostics/zh.ts` 与本文 §10。
- 公开 API/类型变化必须写 `CHANGELOG.md`，并在 `docs/host-integration.md`
  给出迁移片段。
- 新增延时/事件写法前，先回答：它的 `_event.type` 是什么？能否被
  `docEventFacts` 识别？能否通过 internal-only 不变量？否则不要开放作者入口。
- 实现完成后把本文加入 `AGENTS.md` §9 的维护者文档列表，并在 §5 不变量中
  增加“internal-only 生产端一致”。

---

## 附录 A：文档同步清单

| 文件 | 位置 | 更新内容 | 时机 |
| --- | --- | --- | --- |
| `docs/editor.md` | 事件可见性 | 两态 + 复选框 + 弹窗流程；删除 external；补延时中继与 JS 边界 | 实现后 |
| `docs/host-integration.md` | 事件可见性 | `internalOnlyEvents` 类型、迁移、`isInternalOnlyEvent` | 实现后 |
| `README.md` | 特性段落 | “仅内部/双向”，去掉仅外部 | 实现后 |
| `docs/messages.md` | 结构/导入诊断 | 新增 code 行 | 实现时 |
| `docs/README.md` | 内部文档索引 | 加入本文 | 本次 |
| `AGENTS.md` | §5 不变量 / §7 测试 / §9 文档列表 / §10 风险 | internal-only 一致性、JS 不发事件、delayMs 单次、测试套件 | 实现后 |
| `CHANGELOG.md` | 0.15.0 | breaking、新 code、迁移 | 发布时 |
| `src/vue/labels.ts` | labels | 弹窗与复选框 zh/en | 实现时 |
| `src/vue/EventAttrsPanel.vue` | 可见性列 | 复选框 + 弹窗触发 | 实现时 |
| `src/vue/ActionListEditor.vue` | 发送行 | 移除 delay 输入；旧行只读 + 转换 | 实现时 |
| `src/core/examples.ts` | 四个示例 | 改写为 `delayMs`/中继 | 实现时 |
| `test/verify-event-visibility.ts` | 全套 | 删除 external，新增生产者/混合/往返/中继 | 实现时 |

## 附录 B：未决问题

已确认（见 §12）：D11 会话内不再提示；D9 转换器延后到 0.15.x；`eventAttrs` 与
`internalOnlyEvents` 同批迁移。

仍未决：

1. 混合事件以后是否提供“自动拆分”快速修复（当前 error + 手动拆）？
2. `done.state.*` / `error.*` 仅内部的引擎语义是否需要在文档中进一步承诺？
3. sandboxed 数据模型的 JS 全局能力是否与 trusted 完全一致（需补一次断言）？
4. 旧 `send delay` 转换器（0.15.x）是否覆盖带 `data` 的情况（当前设计拒绝）？
