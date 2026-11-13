# statechart-kit / scxmljs 需求记录

> 记录时间：2026-11-11；2026-11-12 追加 Node-RED 宿主 0.7 反哺（KIT-006–011）；
> 2026-11-13 追加全页编辑器作者体验反哺（KIT-012–014）
>
> 本仓库依赖：`statechart-kit@0.11.0`、`@tinyactors/scxmljs@0.2.0-dev.0`
>
> 目的：把本轮测试中遇到、但**不应该在 flow 层反复绕过**的问题固定下来，供 kit / scxmljs 后续版本修复。
>
> 来源：Node-RED 宿主 `@changzhen976/node-red-contrib-statechart@0.7.0-dev.0`
> （宿主仓库 `node-red-contrib-scxmljs`，gitHead `e07e001`）；2026-11-13 的
> KIT-012–014 来自宿主 `0.7.0` 的全页编辑器作者反馈。

## 需求总表

| ID | 归属 | 优先级 | 问题 | 当前状态 |
| --- | --- | --- | --- | --- |
| KIT-001 | `statechart-kit` 编辑器 | P1 | 全屏编辑器左侧「结构 / 状态树」栏无法上下滚动 | 已修复（0.8.1） |
| KIT-002 | `@tinyactors/scxmljs` 渲染器 | P1 | `layoutChart` 在「history 直接挂在 parallel 下 + 转移指向 history」时抛异常，官方 `<scxml-view>` 所有状态重叠 | 已绕过；最小复现 + issue 草案 + fork 方案已记录，待上游修复 |
| KIT-003 | `statechart-kit` SCXML 导入 | P2 | `scxmlToDoc` 不支持 `<donedata>`，导入时告警并丢弃该元素 | 已支持（0.9.0） |
| KIT-004 | `statechart-kit` SCXML 导入 | P2 | `scxmlToDoc` 不支持无 target 的内部转移，导入告警且 ProjectDoc 无法表达 | 已支持（0.9.0） |
| KIT-005 | `@tinyactors/scxmljs` 渲染器 | P2 | 复杂图中同源/同目标的多条条件转移共享走廊，线条近重合、视觉上像重复 | 已记录最小证据与修复方案；待上游修复 |
| KIT-016 | `statechart-kit` 编辑器 | P2 | 结构编辑 addState/removeState/setParent 未维护 ProjectDoc initial 不变量，画布 fallback 与文档/属性面板不一致 | 待修复（0.12.1 / 0.13.1）；详见 `docs/internal/work-items/0.12-initial-invariant.md` |
| KIT-006 | `statechart-kit` engine | P1 | `done` 不携带终态配置，且 done 后仍发一次空 `active`，宿主必须自行保存最后 `fired` 目标 | 已实现（0.11.0） |
| KIT-007 | `statechart-kit` engine | P1 | `error` 事件只有 `kind` / `message`，丢弃引擎已有的出错 element，宿主无法定位到状态/转移/动作 | 已实现（0.11.0） |
| KIT-008 | `statechart-kit` 编辑器 | P2 | `formatValidationIssue` / `formatStructureIssue` / `formatImportWarning` 等硬编码中文，英文宿主的全页编辑器仍显示中文诊断 | 已实现（0.11.0） |
| KIT-009 | `statechart-kit` 编辑器 | P2 | `EditorLabels` 默认中文且约 140 个键，英文宿主只能整份复制；缺少 `labels/en` 或 `locale` 预设 | 已实现（0.11.0） |
| KIT-010 | `statechart-kit` 诊断 | P2 | 没有导出诊断 code 目录，宿主只能手工维护映射；kit 新增 code 时容易漏翻并显示原始 code | 已实现（0.11.0） |
| KIT-011 | `statechart-kit` engine | P3 | `send()` 只返回 boolean，done / not-running / queue-full 都表现为 `false`，宿主无法给出准确错误 | 可选（宿主可先检查 false） |
| KIT-012 | `statechart-kit` 编辑器 | P2 | 结构树的组合/并行状态不能折叠，复杂状态机左栏变成超长列表，难以按层次梳理 | 已实现（0.12.0） |
| KIT-013 | `statechart-kit` 编辑器 | P2 | 左右侧栏折叠按钮位于侧栏顶部，容易被当成普通工具按钮且左栏滚动后消失；应放到分割线纵向中点 | 已实现（0.12.0） |
| KIT-014 | `statechart-kit` 编辑器 | P1 | 横向布局切换后状态机左右溢出画布，左键/滚轮无法露出被裁内容，只有中键原生自动滚动可用 | 已实现（0.12.0） |

---

## Node-RED 宿主 0.7 反哺（2026-11-12）

Node-RED 宿主 0.7 的稳定性轮没有新增节点，但在终态、运行时错误定位和编辑器
本地化上留下了宿主侧 workaround。下面只记录 **kit 应提供的通用能力**；
Hub 单占用、Node-RED 路由/token、变量持久化仍属宿主职责。

| 宿主现象 | 当前 workaround | 对应需求 |
| --- | --- | --- |
| done 后收到空 `active`，终态需要从最后一次 `fired` 反推 | `machine.ts` 检查 `status === 'done'` 并保存 `lastFiredTargets` | KIT-006 |
| 输出 3 只有一句错误文本，无法定位出错状态/转移/动作 | 宿主只透传 `kind` + `message` | KIT-007 |
| en-US 全页编辑器的校验/导入/变量提示仍是中文 | 宿主只能为 tray 表单维护 code → 文案映射 | KIT-008 |
| 英文编辑器需要复制约 140 个 label 键 | 宿主只覆盖 `appTitle` / `save` / `exit` | KIT-009 |
| kit 新增校验 code 时宿主映射可能滞后 | `CODE_MAP` 未命中时直接显示原始 code | KIT-010 |
| done 后发事件被引擎丢弃，Hub 仍显示成功 | 宿主未检查 `send()` 的 boolean | KIT-011 |

---

## KIT-001：左侧结构栏需要滚动

### 现象

全屏状态图编辑器中，状态数量较多时，左侧「结构」栏只能看到前一部分；没有纵向滚动条，后面的状态和转移无法访问。

### 根因

Kit 的布局链是完整的：

```css
.sce-root { height: 100%; }
.sce-main { flex: 1; display: flex; min-height: 0; }
.sce-side { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.sce-side-left { width: 300px; }
```

但左栏内容容器 `.sce-panel.sce-structure` 没有建立滚动上下文：

```css
.sce-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 缺少 flex:1 / min-height:0 / overflow-y:auto */
}
```

父级 `.sce-side` 是 `overflow: hidden`，因此超出的状态树被直接裁掉。右侧属性栏有 `.sce-tab-body { flex:1; min-height:0; overflow-y:auto }`，所以右栏可以滚动，左栏不行。

### 期望

- 左栏整体可纵向滚动；或
- 标题、过滤框、添加按钮固定，状态树和转移列表在独立滚动区内。

最小修复：

```css
.sce-structure {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
```

或：

```css
.sce-side-left {
  overflow-y: auto;
}
```

### 验收

- 生成 100 个以上状态；
- 左栏出现纵向滚动条；
- 能滚动到最后一个状态和最后一条转移；
- 右侧属性栏滚动行为不受影响。

### 修复（0.8.1）

0.8.1 已在 `src/vue/styles.css` 给 `.sce-side-left` 增加 `overflow-y: auto`，建立左栏独立滚动上下文；右栏仍由 `.sce-tab-body` 滚动。发布后宿主升级依赖即可，无需临时覆盖。

---

## KIT-002：parallel 下 history 导致 `<scxml-view>` 布局崩溃

### 现象

把 Cell 的 SCXML 导入 scxmljs 官方页面后，状态全部重叠；`<scxml-view>` 不能正常绘制。

### 复现条件

SCXML 同时满足：

1. `<history>` 直接作为 `<parallel>` 的子元素；
2. 有 transition 的 target 指向该 history（`resume`、`overheat`、重复 start 等）。

最小结构：

```xml
<parallel id="running">
  <history id="hDeep" type="deep"><transition target="power"/></history>
  <state id="power">...</state>
  <state id="conveyor">...</state>
</parallel>

<state id="paused">
  <transition event="cell.resumeDeep" target="hDeep"/>
</state>
```

### 根因

`@tinyactors/scxmljs/dist/view/layout.js` 中：

```js
const kidsOf = (c) =>
  c.kind === "parallel" ? c.children : [...c.children, ...c.history];
```

parallel 子节点只取 `children`，**history 不参与测量和定位**；但 `routeEdges` 仍会处理所有 transition，包括指向 history 的边，随后执行：

```js
const R = (s) => tr(abs.get(s), down);
const cx = (s) => R(s).x + R(s).w / 2;
```

`abs.get(history)` 为 `undefined`，抛出：

```text
TypeError: Cannot read properties of undefined (reading 'x')
```

`<scxml-view>` 布局失败后，各 state 停留在默认位置，看起来就是所有状态重叠。

### 影响版本

已在本地 `@tinyactors/scxmljs@0.2.0-dev.0` 复现；`<scxml-view>` 使用同一套 `dist/view/layout.js`，因此官方页面表现一致。

### 最小复现（已实测）

```xml
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="paused">
  <parallel id="running">
    <history id="h" type="deep"><transition target="a"/></history>
    <state id="a"/>
  </parallel>
  <state id="paused">
    <transition event="resume" target="h"/>
  </state>
</scxml>
```

Node 复现：

```js
import { DOMParser } from '@xmldom/xmldom'
import { parseSCXML } from '@tinyactors/scxmljs/dist/session.js'
import { compile } from '@tinyactors/scxmljs/dist/model.js'
import { layoutChart } from '@tinyactors/scxmljs/dist/view/layout.js'

const root = parseSCXML(source, new DOMParser())
const model = await compile(root)
layoutChart(model.root, {
  measure: () => ({ w: 80, h: 30 }),
  labelSize: () => ({ w: 40, h: 12 }),
})
```

实际结果：

```text
TypeError: Cannot read properties of undefined (reading 'x')
    at cx (.../dist/view/layout.js:616:27)
    at routeEdges (.../dist/view/layout.js:633:44)
    at layoutChart (.../dist/view/layout.js:532:20)
```

### 期望

二选一：

1. parallel 下的 history 也参与布局（作为伪态盒子绘制），并允许指向它的边；或
2. 布局时跳过指向未布局 pseudo-state 的边，并给出 warning，至少不 crash、不重叠。

### 验收

- 用上述最小 SCXML 调用 `layoutChart` 不抛异常；
- 所有 state 矩形坐标不重合；
- `<scxml-view>` 能绘制 parallel 区域与 history 伪态；
- 指向 history 的 transition 有可见路由或明确的 warning。

### 上游 Issue 草案

标题：

```text
layoutChart throws when a transition targets a <history> directly inside <parallel>
```

正文要点：

```md
Version: @tinyactors/scxmljs@0.2.0-dev.0

`layoutChart` crashes when a transition targets a history pseudo-state that is
a direct child of a `<parallel>`. The history is excluded from `kidsOf()` for
parallel containers, so it never gets a rectangle in `abs`. `routeEdges()` then
computes `R(p.to)` for that history and throws:

  TypeError: Cannot read properties of undefined (reading 'x')
      at cx (dist/view/layout.js)
      at routeEdges (dist/view/layout.js)
      at layoutChart (dist/view/layout.js)

`<scxml-view>` catches the failure and leaves the state boxes at their default
positions, so every state appears stacked on top of every other state.

Minimal repro is in the issue body (one parallel, one history, one transition
to the history). The same document is valid SCXML and runs correctly in the
interpreter; only layout fails.

Expected: either lay out history pseudo-states under parallel, or skip edges
whose endpoint has no layout box and surface a warning. At minimum layoutChart
must not throw and must not stack all states.
```

### Fork 修复方案

优先级 1（最小、可先用）：

- 在 `routeEdges()` 的端口计算前过滤未布局节点：

```js
const placeable = pending.filter((p) => abs.has(p.from) && abs.has(p.to))
const skipped = pending.filter((p) => !abs.has(p.from) || !abs.has(p.to))
```

- 对 `skipped` 给出 warning（或放进 `layoutChart` 返回值的 `warnings`）。
- 这能保证不 crash、不重叠，但指向 history 的边不会绘制。

优先级 2（完整）：

- 为 parallel 下的 history 建立独立的小盒子，放在 parallel 头部或区域网格下方；
- 将 history 加入 `abs` 和 `boxes`，但不加入 `arrangeRegions()` 的区域列表；
- `routeEdges()` 正常为指向 history 的边寻路；
- 增加一个最小 SCXML 的单元测试：断言 `layoutChart` 不抛异常、所有 box 坐标不重合。

建议先提 issue；如果上游短期不处理，再 fork 并用上述优先级 1 的 guard 作为补丁，避免官方 viewer 继续重叠。

### 当前绕过

把 `running` 从「parallel 本身」改成「compound 包一层 parallel」：

```xml
<state id="running" initial="p">
  <history id="hShallow" type="shallow"><transition target="p"/></history>
  <history id="hDeep" type="deep"><transition target="p"/></history>

  <parallel id="p">
    <state id="power">...</state>
    <state id="conveyor">...</state>
    <state id="safety">...</state>
  </parallel>

  <transition event="cell.pause" target="paused"/>
  <transition event="cell.stop" target="offline"/>
</state>
```

这样 history 是 compound 的子节点，`kidsOf` 会包含它们，布局正常。

验证结果：

```text
layoutChart(Cell) → width 1492, height 688, boxes 20, edges 22
editor scxmlToDoc → warnings 0, structure issues 0
```

代价：活动状态会多一个 `p`（`running` 的 parallel 子状态）。测试断言使用包含关系，不受影响。

---

## KIT-003：`scxmlToDoc` 支持 `<donedata>`

### 现象

打开 Cell 配置时弹窗：

```text
import.element.unsupported
{"at":{"stateId":"decommissioned.done"},"tag":"donedata"}
```

### 根因

`statechart-kit` 的 SCXML → ProjectDoc 导入器没有 `donedata` 文档模型；该元素是合法 SCXML，但导入时被标记为 unsupported。

### 期望

- ProjectDoc 增加 final data 表达；或
- 导入时保留原始片段并给出非阻断 warning，不丢失 `<donedata>`；
- 至少不要因为 final data 导致整个状态机渲染异常。

### 当前绕过

Cell/Supervisor 的终止态已移除 `<donedata>`。终止信息改用事件（`sys.cell.decommissioned`、`sys.supervisor.shutdown`）传递。

### 实现（0.9.0）

`StateNode.doneData` 支持 `content` / `expr` / `param` 三种形态；`scxmlToDoc` 保留
`<donedata>`，`serializeToScxml` 原样导出，结构校验限制为 final 且拒绝多形态并存。
宿主之前移除的 donedata 需在宿主侧自行恢复，kit 不会自动改回。

---

## KIT-004：`scxmlToDoc` 支持无 target 的内部转移

### 现象

编辑器导入时告警：

```text
import.transition.no-target
{"at":{"stateId":"running","slot":"transition"},"event":"cell.start"}
```

### 根因

原 Cell 用无 target 的 `type="internal"` 转移做重复握手：

```xml
<transition event="cell.start" type="internal">
  <send event="cell.ready">...</send>
</transition>
```

这是合法 SCXML，但 ProjectDoc 的 transition 模型要求 target；导入器无法表达，导致该转移在编辑器中丢失，图形也不完整。

### 期望

- ProjectDoc 支持 targetless / internal transition；或
- 导入器将其映射为「内部动作」并保留，不丢转移；
- 若确实不支持，应给出明确 warning，并保证其余图仍可渲染。

### 当前绕过

所有内部转移都改成显式 target：

- Cell 重复 start：`target="hDeep"`（深历史恢复并行配置）；
- Supervisor `job.accepted`：`target="hRun"`；
- Supervisor degraded 内 `cell.overheat`：`target="degraded"`；
- Job `job.priority`：移除（测试按钮一并删除）。

现在三台机器导入均为 0 warning / 0 structure issue。

### 实现（0.9.0）

`TransitionEdge.target` 允许为 `null`，并新增 `transitionType?: 'internal' | 'external'`。
导入器保留无 target / `type="internal"` 转移，序列化器省略 target、保留 type；
编辑器结构面板可新建“无目标（内部转移）”，画布可选中 targetless chip。
`import.transition.no-target` 不再发出。宿主可以恢复之前的无 target 握手写法。

---

## KIT-005：复杂图中的条件转移线条近重合，视觉上像重复

### 现象

状态机复杂后，同一对源/目标之间有多条条件转移，或不同转移共用同一段走廊时，自动布线会把它们画成很近的平行线，甚至共享很长的水平/垂直线段，看起来像“线条重复”。

Cell 里就能看到：

```text
move.done      moving → idle
conveyor.stop  moving → idle
```

`layoutChart` 实际输出（`sp.edge = 10`）：

```text
move.done:
  (1012,339.4) → (1124,339.4) → (1124,370)
  → (1396,370) → (1396,326) → (1416,326)

conveyor.stop:
  (1012,352.6) → (1134,352.6) → (1134,370)
  → (1406,370) → (1406,334) → (1416,334)
```

两条边都沿 `y = 370` 从约 `x = 1124/1134` 走到 `1396/1406`，只差 10px；在缩放后的画布上很容易被看成同一条线或重复线。

### 根因

`@tinyactors/scxmljs/dist/view/layout.js` 的布线粒度是 **每条 transition × 每个 target**，不是 `(from, to)` 边组：

- `weights` 只在分层阶段按 `a→b` 合并权重，**绘制阶段仍为每条 transition 生成一条 edge**；
- `channelUse` / `channelX` 只按 gap 分配固定 `sp.edge` 偏移；
- 没有“同源同目标边组”的偏移、捆绑或标签避让；
- 没有检测长距离共享走廊。

因此边数一多，尤其是嵌套/并行容器里多条边被提升到同一层间走廊时，就会出现近重合。

### 可修复性

可以修复，属于布局路由增强，不是状态机语义问题。按成本从低到高：

1. **最小**：按 `(from.id, to.id)` 分组，给同组边分配递增偏移和独立端口；标签沿组内顺序错开。能减少完全重合，但边多时仍拥挤。
2. **推荐**：同组边使用 bundle/trunk + 分支，或折叠为一条边并在标签上显示条件数量；点击/悬停展开。
3. **完整**：增加标签碰撞检测和走廊占用检测，动态调整 `sp.edge` / `sp.label`。

验收标准：

- 同一对源/目标有 5 条条件转移时，5 条边可区分（或合并为 1 条可展开的 bundle）；
- 任意两条边的长直线段不完全重合；
- 标签矩形不重叠；
- 不影响现有单条转移的布线。

### 上游 Issue 草案

标题：

```text
layoutChart draws near-duplicate edges for multiple guarded transitions between the same states
```

正文要点：

```md
Version: @tinyactors/scxmljs@0.2.0-dev.0

When several transitions share the same source and target (for example guarded
transitions on the same event, or different events both returning to the same
state), layoutChart routes each transition independently through the same
corridor. `sp.edge` only separates them by 10px, and long horizontal/vertical
segments can overlap for hundreds of pixels. In complex nested/parallel charts
this looks like duplicated transition lines.

Concrete example from a three-region chart:

  move.done      moving -> idle
  conveyor.stop  moving -> idle

Both edges run along y = 370, from x ~1124/1134 to ~1396/1406, only 10px apart.

Expected: group edges by (from, to), give the group intentional separation or a
bundle, and avoid label collisions. At minimum, no two long straight segments
should overlap exactly.
```

### Fork / 修复方向

- 在 `routeEdges()` 前为 `pending` 增加 `groupKey = `${p.from.id}→${p.to.id}``；
- 按组分配 `groupIndex`，在 `channelX` / `laneY` 中叠加组内偏移；
- 端口分配把组内边排在一起，标签按组内顺序纵向错开；
- 增加“共享走廊段”检测，必要时增加 lane；
- 单测：同一对状态放 10 条带不同 `cond` 的转移，断言 `points` 不完全相同、标签矩形不相交。

更彻底的产品方案是把同源同目标的多条条件边折叠成一条 bundle，标签显示 `3 conditions`，展开后再看每条条件；这需要 `<scxml-view>` 的交互和布局共同改动。

### 当前规避

- 测试床里暂时接受这种视觉近重合；它不影响 SCXML 语义和运行；
- 如果只是展示用途，可把同源同目标的多条转移合并为一条，用 `<if cond="_event.name === ...">` 区分动作；
- 或在 flow 中避免多个条件转移落在同一对状态上。


---

## KIT-006：done 事件携带终态配置，并抑制 done 后的空 active

### 现象

Node-RED 宿主在机器到达顶层 final 后，需要自己保存最后一次 `fired` 的目标，
才能把终态显示出来；同时引擎在 `done` 之后还会再发一次 `active: []`，宿主
必须判断 `status === 'done'` 来丢弃它。

宿主当前实现：

```ts
// src/nodes/machine.ts
case 'active':
  // The engine emits one empty active after done; keep the done state.
  if (created.status === 'done') return
  publishState(created)
  break
case 'done':
  if (lastFiredTargets.length) {
    publishState(created, lastFiredTargets)
    lastFiredTargets = []
  }
```

这是所有宿主都会遇到的通用问题，不应由每个宿主重复实现。

### 证据

- `RunnerDoneEvent` 当前只有 `{ type: 'done', data }`，没有终态 id；
- 引擎在进入顶层 final 后会清空 configuration；
- kit 的 `onMacro` 仍会转发一次 `active: []`，宿主只能靠 runner 的 `status`
  过滤。

### 期望

```ts
interface RunnerDoneEvent {
  type: 'done'
  /** 顶层 final 的 donedata，保持现状 */
  data: unknown
  /** 进入终态前的最后活跃配置；至少包含顶层 final 的 id */
  states: string[]
}
```

同时：`status === 'done'` 后不再向宿主发 `active: []`。

建议 kit 在最后一次 macrostep / 进入顶层 final 的 microstep 记录 configuration，
在 `done` 事件中一并发出。

### 验收

- 顶层 final 机器：状态输出只出现一次 `['done']`，随后只有 `done` 事件；
- `RunnerDoneEvent.states` 包含 final id；
- 宿主删除 `lastFiredTargets` 与 `status === 'done'` 两处 workaround 后行为不变；
- parallel / nested final 场景仍按现有语义工作。

### 兼容性

- 给 `RunnerDoneEvent` 增加字段是向后兼容的；
- 不再发空 `active` 属于行为修正，写入 `CHANGELOG` 的 Changed/Fixed；
- 公开契约文档 `docs/session-events.md` 同步更新。

---

## KIT-007：error 事件携带出错位置

### 现象

Node-RED 宿主把运行时错误送到 Hub 输出 3 时，只能得到：

```ts
{ type: 'error', kind: 'error.execution', message: '...' }
```

用户无法知道是哪个状态、哪条转移、entry/exit/transition 的哪个动作出错，
只能把整张图打开逐个排查。

### 证据

- 引擎的 `SCXMLErrorEvent` 已包含 `element: Element | null`（出错的 `<assign>` /
  `<script>` 等）；
- kit 的 `RunnerErrorEvent` 只保留 `kind` / `message`，丢掉了 `element`；
- kit 已有 `locateIssues` 等从 element / code 定位文档对象的能力，可复用到运行时错误。

### 期望

保持现有字段，增加可选定位信息（命名可再讨论）：

```ts
interface RunnerErrorEvent {
  type: 'error'
  kind: SCXMLErrorKind
  message: string
  stateId?: string
  transitionId?: string
  slot?: 'entry' | 'exit' | 'transition'
  actionIndex?: number
  /** 或透传一个可序列化的 element 描述，避免宿主直接依赖 DOM */
  element?: { localName: string; id?: string }
}
```

### 验收

- 在 entry、exit、transition action 中分别抛错，事件能带上对应 `stateId` /
  `transitionId` / `slot` / `actionIndex`；
- 无法定位时不强行填字段，保持向后兼容；
- 宿主输出 3 可展示“哪个状态/动作出错”，不再只有一句话。

### 兼容性

- 全部为可选字段，向后兼容；
- `docs/session-events.md` 的“error.element 暂不在公共契约中”说明需同步更新。

---

## KIT-008：诊断格式化可本地化

### 现象

`EditorLabels` 覆盖了工具栏、结构、属性、仿真等 UI 文案，但编辑器校验面板、
导入警告和变量写入结果仍由 kit 的 `format*` 函数输出硬编码中文：

- `formatValidationIssue`
- `formatStructureIssue`
- `formatImportWarning`
- `formatVariableResult`

Node-RED 宿主当前只能为 tray 三表维护 code → 中英文映射；en-US 用户打开全页
编辑器时，校验/导入/变量提示仍是中文。

### 证据

- `src/vue/format.ts` 的展示文案是中文；
- kit 只发布 `diagnostics/zh`，没有 `diagnostics/en`；
- `CreateEditorOptions` 已有 `labels`，但没有诊断 formatter / messages 注入点。

### 期望

二选一（或同时提供）：

1. `CreateEditorOptions` 增加 `formatIssue` / `formatWarning` / `formatVariableResult`
   之类的注入点；
2. 发布 `statechart-kit/diagnostics/en`，并提供与 `diagnostics/zh` 对称的入口。

宿主应能整体替换诊断文案，而不是复制 kit 内部格式化逻辑。

### 验收

- 以 en formatter 挂载编辑器，校验失败、导入警告、变量写入错误均为英文；
- 默认不传 formatter 时保持现有中文行为；
- 新增诊断 code 时，formatter 未覆盖的 code 有明确的 fallback。

### 兼容性

- 新增可选选项/新入口，默认行为不变；
- 如果新增 `diagnostics/en`，属于向后兼容的新导出。

---

## KIT-009：英文 EditorLabels 预设 / locale

### 现象

`EditorLabels` 已支持任意键覆盖，但默认值全是中文，约 140 个键。英文宿主
必须整份复制并翻译，维护成本高，且 kit 后续新增 label 时容易漏。

### 期望

提供以下任一能力：

- `statechart-kit/vue` 导出 `DEFAULT_LABELS_EN`；
- `createEditor({ locale: 'en' })`，内部使用英文预设；
- 或发布可单独 import 的 `labels/en`。

宿主只需覆盖应用特有的 `appTitle` / `save` / `exit` 等少量键。

### 验收

- 以英文预设挂载编辑器，工具栏、结构、属性、变量、仿真、校验、确认框均为英文；
- 不传 locale 时保持中文默认；
- 新增 label 键时，英文预设同步补齐（类型检查可发现）。

### 兼容性

- 纯新增预设/选项，向后兼容；
- 这是便利性需求；宿主当前也可以通过完整覆盖 `labels` 实现，只是维护成本高。

---

## KIT-010：导出诊断 code 目录

### 现象

Node-RED 宿主的 tray 表单用 `CODE_MAP` 把 `StructureIssue.code` 映射到本地化
文案；未命中的 code 会原样显示，例如 `structure.state.some-new-rule`。

kit 每次新增结构校验 code，宿主都可能漏翻或漏测。

### 期望

导出稳定的 code 目录，例如：

```ts
export const STRUCTURE_ISSUE_CODES: readonly string[]
export const IMPORT_WARNING_CODES: readonly string[]
```

或提供等价的 JSON 元数据。宿主可据此做覆盖率测试。

### 验收

- 宿主测试 import 目录，断言每个 code 都有本地化文案；
- kit 新增 code 时，宿主 CI 能明确失败而不是运行时显示原始 code；
- 目录中的 code 与 `docs/messages.md` 保持一致。

### 兼容性

- 纯新增导出，向后兼容；
- 不要求 kit 保证 code 永不变更；变更仍按现有语义版本约定处理。

---

## KIT-011：send() 返回失败原因（可选）

### 现象

`SessionRunner.send()` 返回 boolean。机器到达 done、runner 未启动、队列满等
情况都表现为 `false`，宿主无法区分原因。Node-RED 宿主当前没有检查返回值，
因此 done 后的事件仍会显示为成功。

### 期望

优先保持 `send()` 的 boolean 签名，新增一个可选方法：

```ts
trySend(name, data?, logText?, logKind?, source?): {
  ok: boolean
  code?: 'not-running' | 'done' | 'queue-full' | 'invalid-event'
}
```

或在下一 minor 中把 `send()` 改为返回结构化结果（需明确破坏性变更）。

### 验收

- done 后发送返回 `code: 'done'`；
- runner 未启动返回 `code: 'not-running'`；
- 宿主可据此在 Hub 输出 3 报错，而不是显示绿色成功。

### 兼容性

- 新增 `trySend` 为向后兼容；
- 直接改 `send()` 返回类型属于破坏性变更，必须写入 `CHANGELOG`。

### 备注

宿主可先检查现有 `send()` 的 boolean 并报错；本项是改善错误原因，不阻塞 0.7。

---

## 0.12 候选：编辑器作者体验（2026-11-13）

以下三项来自 Node-RED 宿主 `0.7.0` 全页编辑器的作者反馈。三项都属于
`statechart-kit` 编辑器层，不需要宿主改业务代码，也不要求
`@tinyactors/scxmljs` 发版；宿主只需升级 kit 后重新构建、回归、发布。

| ID | 主题 | 优先级 | kit 工作量 | 宿主动作 |
| --- | --- | --- | --- | --- |
| KIT-012 | 结构树组合状态折叠 | P2 | 0.5–1 人日 | 升级 kit，重新打包 |
| KIT-013 | 侧栏折叠按钮移到分割线中点 | P2 | 0.5–1 人日 | 升级 kit，重新打包 |
| KIT-014 | 横向布局画布溢出与导航 | P1 | 1.5–2.5 人日 | 升级 kit，重新打包 |

建议开发顺序：**KIT-014 → KIT-012 → KIT-013**。KIT-014 是功能性阻塞；KIT-012 /
KIT-013 可以并行，且都只改编辑器 DOM/CSS/组件状态，不改 `ProjectDoc` 与 SCXML。

---

## KIT-012：结构树支持组合/并行状态折叠

### 现象

全页编辑器左栏「结构」按层级缩进展示所有状态。当前组合状态（`compound`）和
并行状态（`parallel`）的子状态**始终展开**；状态机稍复杂（几十个状态、多层嵌套）
时，左栏会变成一条很长的列表：

- 作者很难一眼看清顶层结构、当前选中状态在树中的位置；
- 转移分组被推到很远，需要频繁滚动；
- 只能靠过滤框临时缩小范围，过滤清空后又回到长列表。

当前没有折叠/展开入口。

### 根因/证据

`StructurePanel.vue` 的 `rows` 对所有容器无条件递归，没有折叠状态：

- [`StructurePanel.vue`](../../src/vue/StructurePanel.vue#L73-L86)

模板行只渲染 kind、label、id、删除按钮，没有 caret：

- [`StructurePanel.vue`](../../src/vue/StructurePanel.vue#L168-L185)

`kindLabel` 已经把 `compound` 显示为「组合」、`parallel` 显示为「并行」：

- [`StructurePanel.vue`](../../src/vue/StructurePanel.vue#L108-L113)

### 整改目的

1. **降低信息密度**：复杂状态机先看顶层结构，再按需展开某个组合/并行状态；
2. **减少滚动和过滤**：折叠后仍保留状态选中、转移分组、删除等操作；
3. **不改变文档语义**：折叠只是作者态 UI 状态，不写入 `ProjectDoc`/SCXML，
   不影响保存、导入导出和运行时；
4. **向后兼容**：默认全部展开，现有用户行为不变。

### 期望行为

- `compound` / `parallel` 行首出现折叠按钮（caret），默认展开；
- 点击 caret 折叠/展开直接子状态，再次点击恢复；
- 折叠状态按 `state.uid` 记忆，至少在当前编辑会话内保持；
- 过滤框有输入时，强制展开所有命中路径；清空过滤后恢复之前的折叠状态；
- 从画布选中一个被折叠隐藏的后代时，自动展开其祖先并滚动到该行；
- 新建、删除状态、切换文档时不出现“幽灵折叠”；
- 行点击选中、删除按钮、转移列表行为不变；
- 中英文 tooltip 可用（复用 `EditorLabels.collapse/expand`）。

### 非目标

- 不把折叠状态写入 `ProjectDoc`/SCXML；
- 不做跨会话持久化（localStorage / 宿主存储）——如需要，另列可选需求；
- 不做“树折叠同步画布折叠”；当前 `<scxml-view>` 的 collapsed 集合不是公共受控
  API，若要联动需要 scxmljs 暴露受控接口，属于二期；
- 不改变状态排序、层级规则和转移分组逻辑。

### 建议实现

- 增加 `folded = ref<Set<string>>(new Set())`，按 `state.uid` 记录；
- `rows` 中：`if (container && (active || !folded.has(s.uid))) walk(...)`；
- 行首增加 caret 按钮，`@click.stop`，带 `aria-expanded` 和 `title`；
- 选中变化时向上遍历 `parent`，删除祖先的 folded 记录；
- `editor.doc` 引用变化时清空 folded；删除状态后清理失效 uid；
- 只在 `compound`/`parallel` 上显示 caret；`atomic`/`final`/`history` 不显示；
- `check-vue` 增加组合状态用例：默认展开、点击折叠、搜索自动展开、选中隐藏后代
  自动展开。

### 验收

- 20+ 状态、3 层嵌套的组合状态：折叠后子状态行消失，展开后恢复；
- 过滤命中隐藏子状态时自动展开，清空过滤后恢复折叠；
- 画布选中隐藏子状态时左栏自动展开并滚动到该行；
- 折叠/展开不改变 `editor.doc`，保存/导出 SCXML 不变；
- `check:vue` 覆盖 caret、折叠、过滤展开、选中展开；
- 中英文界面 tooltip 正常。

### 工作量

0.5–1 人日（实现 + check-vue + 文档）。

### 待决

- 是否覆盖 `parallel`：建议覆盖，二者都是有子状态的容器；
- 是否需要跨会话持久化：建议一期不做；
- 是否需要与画布折叠联动：建议二期，需 scxmljs API。

---

## KIT-013：左右侧栏折叠按钮移到分割线纵向中点

### 现象

全页编辑器左右侧栏各有一个折叠按钮，当前位于侧栏顶部，和标题/标签页混在一起：

- 视觉上像普通工具按钮，作者很难发现这是“收起侧栏”的入口；
- 左栏本身是滚动容器，按钮会随内容滚动，滚到中间以后入口消失；
- 需求是把按钮放到左右分割线的**纵向中点**，作为“面板把手”。

### 根因/证据

左右栏按钮都在 `<aside>` 内部，CSS 是 `align-self: flex-start`，所以停在顶部：

- [`EditorHost.vue`](../../src/vue/EditorHost.vue#L150-L164)
- [`EditorHost.vue`](../../src/vue/EditorHost.vue#L187-L199)

`.sce-pane-toggle` 的样式是普通小按钮，不是覆盖在分割线上的把手：

- [`styles.css`](../../src/vue/styles.css#L94-L109)

左栏 `.sce-side-left` 自身是 `overflow-y: auto` 的滚动容器，按钮放在里面无法固定
在视口中点；直接改 `position: absolute; top: 50%` 会随内容滚动。

### 整改目的

1. **可发现性**：把折叠入口放在分割线中点，符合可拖拽面板的通用 affordance；
2. **稳定性**：按钮不随左栏内容滚动，始终停在视口中点；
3. **不误触**：按钮与拖拽 resizer 共存，但按钮本身不挡住整条拖拽线；
4. **零数据影响**：只改 DOM 包裹和 CSS 定位，不改侧栏宽度、内容、`features` 默认值。

### 期望行为

- 左右侧栏折叠按钮都位于对应分割线的纵向中点；
- 展开态、收起态都显示；收起后仍可点击展开；
- 按钮不随左栏内容滚动；
- 按钮不挡住整条 resizer；拖拽分割线其他位置仍可调宽；
- 键盘可聚焦，Enter/Space 可切换；`aria-expanded` 正确；
- 与画布右上角的方向切换/缩放控件不重叠；
- 1280/1920 宽度、左右栏同时打开时视觉正常。

### 非目标

- 不改 `PANE_MIN` / `PANE_MAX`、拖拽逻辑、双击复位；
- 不做移动端抽屉/浮层；
- 不引入第三方 split-pane 组件；
- 不改 `features.resizablePanes` 的默认值。

### 建议实现

- 给左右栏各加 `.sce-pane` 包装层（`position: relative; display: flex; flex: none`），
  `<aside>` 放在里面；
- 折叠按钮作为包装层的绝对定位兄弟，`top: 50%; transform: translateY(-50%)`；
- 左栏 `right: -9px`，右栏 `left: -9px`，让按钮中心落在分割线上；
- 收起态宽度 28px 时同样定位在边缘中点；
- `z-index` 高于画布和 resizer；按钮尺寸建议 18–20 × 36–40px；
- 保留 `aria-expanded` / `aria-label` / `title`；
- `check-vue` 更新选择器，断言按钮在包装层内、点击可收起/展开。

### 验收

- 左右按钮在分割线纵向中点，不是顶部；
- 左栏滚动时按钮位置不动；
- 收起态按钮仍可见、可展开；
- 拖拽分割线（按钮以外区域）仍可调宽，双击复位正常；
- 键盘可操作，aria 状态正确；
- Firefox/Chromium 视觉检查通过。

### 工作量

0.5–1 人日（实现 + check-vue + 视觉验证）。

### 待决

- 按钮形态：半圆贴边、胶囊、还是带阴影的小圆钮；
- 是否 hover 才显示：建议常驻，降低发现成本；
- 收起态是否显示文字：建议只显示箭头。

---

## KIT-014：横向布局切换后画布溢出与导航不可用

### 现象

默认自动布局下，把布局切成「横向」后，状态机**左右溢出画布边缘**：

- 左键拖拽/滚轮只能移动外层盒子，无法露出被裁掉的内容；
- 只有按住鼠标中键左右拖动（浏览器原生自动滚动）才能移动看清全貌；
- 复杂状态机在横向布局下无法一眼看全，也不能用常规滚轮/拖拽导航。

这不是“横向布局不支援”，而是 kit 画布包装层与官方 `<scxml-view>` 缩放策略叠加
导致的可视区域裁切 + 导航失效。

### 根因/证据

1. `innerW` 被 `ResizeObserver` 设成**容器可视宽度**，`innerH` 固定 3200；内层
   “大画布”横向没有多余空间：
   [`ChartCanvas.vue`](../../src/vue/ChartCanvas.vue#L360-L372)
2. 官方 view 在内容宽于宿主时按 `--scxml-min-scale` 缩放，默认最低 **0.65**，再内部
   滚动：`@tinyactors/scxmljs@0.2.0-dev.0` 的 `dist/view/element.js` `#applyFit`。
3. kit 又隐藏 view 内部滚动条，并 `preventDefault` 拦截滚轮：
   [`styles.css`](../../src/vue/styles.css#L453-L455)、
   [`ChartCanvas.vue`](../../src/vue/ChartCanvas.vue#L406-L415)
4. 切换方向只改 `direction`，**没有重新 fit**；`fitView` 最低缩放 0.3，大图仍然
   放不下：
   [`ChartCanvas.vue`](../../src/vue/ChartCanvas.vue#L101-L112)、
   [`ChartCanvas.vue`](../../src/vue/ChartCanvas.vue#L383-L384)、
   [`ChartCanvas.vue`](../../src/vue/ChartCanvas.vue#L440-L454)

净效果：外层 `.zoom-pan` 横向没有额外画布，左键/滚轮平移只是移动“已经被 view
裁掉的盒子”；真正能滚到隐藏内容的是浏览器对 shadow `.canvas` 的中键原生自动
滚动——所以用户感觉“只有中键左右拖才能看全”。

### 整改目的

1. **让横向布局真正可用**：切过去就能看到全貌，而不是先找中键；
2. **恢复“大画布 + 外层缩放/平移”设计**：滚轮、左键拖拽、缩放按钮、适应窗口都
   在完整图上工作；
3. **不依赖隐藏的内部滚动条**：作者不需要理解 shadow DOM 的滚动行为；
4. **不改变文档与运行时**：只改画布尺寸、fit 和导航，不改 `ProjectDoc`/SCXML/
   `layoutChart` 算法；
5. **为复杂状态机兜底**：超宽/超高图也能通过动态扩容或等效方案完整呈现。

### 归属判断

| 层 | 结论 |
| --- | --- |
| `statechart-kit` 编辑器 | **要改**：画布尺寸、fit、方向切换、滚动条隐藏都在 kit |
| `node-red-contrib-scxmljs` 宿主 | **只升级 kit 并重新打包**，不改 `editor-page` / 节点逻辑 |
| `@tinyactors/scxmljs` | **本需求不要求发版**：已有 `direction`、自动布局、`max-states` 折叠、`fit`；原生 zoom/pan 未发版，但 kit 已有外层缩放层 |
| 可选二期 | 树/画布折叠联动需要 scxmljs 暴露受控 `collapsed` 集合，另算 |

### 期望行为

- 切换「横向 / 纵向 / 自动」后自动 fit 一次，整张图完整落在画布视口内；
- 之后用户手动缩放/平移不被重置；
- 滚轮/触摸板平移、Ctrl+滚轮缩放、左键拖拽平移都能在完整图上工作；
- 不再依赖中键原生自动滚动；
- 超宽/超高图（超过固定画布）仍能完整呈现；
- 右侧栏调宽/窗口 resize 不强制重置视图（保留用户当前缩放）；
- 布局切换不改变文档、不触发保存、不影响仿真。

### 非目标

- 不改 `@tinyactors/scxmljs` 的 `layoutChart` 算法；
- 不实现 view 原生 zoom/pan（等上游发版后再评估）；
- 不做 mini-map/缩略图/横向滚动条皮肤；
- 不改变方向按钮的位置和交互；
- 不把画布尺寸写进 `ProjectDoc`。

### 建议方案 A（推荐）

1. 拆分 `viewportW`（只用于 auto 断点）与 `canvasW/H`（用于绘制）；`canvasW/H`
   固定 6000×4000 或按内容增长；
2. `contentSize()` 读 shadow root 的 `.diagram.offsetWidth/offsetHeight`（加 24px
   margin），**不要读 `.canvas.scrollWidth`**——大画布下它会等于 6000，fit 会把
   整张空白画布当内容；
3. 方向切换：`el.direction = want` → `await nextTick()` → `requestAnimationFrame`
   → `fitView()`；必要时 100–150ms 后再 fit 一次；
4. `fitView` 最低缩放从 0.3 降到 **0.1**（或区分 `FIT_MIN=0.1` 与 `ZOOM_MIN=0.3`），
   避免大图永远 fit 不进去；
5. 超大图：渲染后若 `diagram.offsetWidth + 48 > canvasW`，把 `canvasW` 增长到内容宽，
   等一帧重绘后再 fit；高度同理；
6. 侧栏调宽/窗口 resize 默认不自动 fit，保留“适应窗口”按钮；
7. 保留现有 `.zoom-pan` 手势阈值、点击选中、Ctrl+滚轮缩放逻辑。

### 方案 B（临时缓解，不作为最终方案）

宿主可临时加 CSS：

```css
scxml-view { --scxml-min-scale: 0.1; }
```

让官方 view 直接缩到 0.1 避免裁剪；或显示 `::part(canvas)` 的横向滚动条。但这会让
图很小、方向切换不居中、外层平移仍无效，只能止血。

### 方案 C（不推荐现在做）

等 scxmljs 发布原生 zoom/pan，kit 删除外层缩放层。跨库发版，约 3–5 人日，和本次
三个 UX 问题没有依赖关系。

### 验收

- 22 状态宽图、900px 视口，自动布局 → 点击「横向」后所有 `[data-state]` 盒子都在
  `.zoom-pan` 内；
- 滚轮/左键拖拽可平移，不再需要中键；
- `view.shadowRoot` 内 `.canvas` 不出现横向裁切；
- 800/1280/1920 宽度、Firefox/Chromium 通过；
- 超宽图（>6000px）动态扩容后仍能 fit；
- 切换方向不改变 `editor.doc`，不触发保存。

### 工作量

1.5–2.5 人日（实现 + 宽图浏览器回归 + 跨浏览器验证）。

### 待决

- fit 下限 0.1 还是 0.15；
- 超大图动态扩容上限（如 12000/20000px）；
- 侧栏调宽后是否自动 fit：建议否，保留用户当前缩放；
- 整图 fit（字可能很小）还是 fit 宽度 + 纵向滚动：建议整图 fit + 手动放大。

---

## 0.12 实施建议（KIT-012–014）

| 顺序 | 内容 | 依赖 | 预估 |
| --- | --- | --- | --- |
| 1 | KIT-014 横向画布溢出与方向切换 refit | 无 | 1.5–2.5 人日 |
| 2 | KIT-012 结构树折叠 | 无 | 0.5–1 人日 |
| 3 | KIT-013 侧栏折叠按钮 | 无 | 0.5–1 人日 |
| 4 | 测试、文档、baseline、发版 | 1–3 | 0.5–1 人日 |
| 5 | 宿主升级 kit + 回归 + 发版（宿主仓库） | kit 发布 | 0.5–1 人日 |

kit 侧合计约 **3–5.5 人日**，含宿主升级约 **3.5–6.5 人日**，建议按 **5 人日**排期。

建议分支与提交：

```text
feat/editor-ux-0.12
  ├─ fix(canvas): fit after direction change and grow canvas to content
  ├─ feat(structure): fold compound/parallel states
  ├─ feat(ui): center pane toggles on the splitter
  └─ chore(release): 0.12.0 baseline + changelog
```

发布前检查：

- `npm run typecheck && npm test && npm run build && npm run check:vue && npm run check:pack`；
- `npm run check:baseline` 前先 `npm run freeze:baseline` 更新改动文件哈希；
- 宽图浏览器回归至少覆盖 Firefox 与 Chromium；
- 宿主侧 `npm run test:live` / `test:browser` / `test:p4` 通过；
- 宿主 `scripts/check-kit.mjs` 的 `EXPECTED_VERSION` 同步到新 kit 版本。

---

## 回归资产

- 示例：`node-red-contrib-scxmljs/examples/cascade-test.json`
- 测试：`node-red-contrib-scxmljs/scripts/test-cascade.mjs`
- 命令：

```sh
CASCADE_BASE=http://homeassistant:1880 npm run test:cascade
```

当前结果：14/14 通过。

## 更新建议

- KIT-001 已进入 `statechart-kit` 0.8.1 补丁。
- KIT-002 属于上游 `@tinyactors/scxmljs` 渲染器修复；在修复前，文档和示例应避免 parallel 直接挂 history。
- KIT-003 / KIT-004 已在 0.9.0 完成模型、导入器、序列化器、校验与编辑器支持。
- KIT-005 属于上游布线能力增强；建议先做最小边组偏移，再评估 bundle/折叠交互。
- KIT-006 / KIT-007 已在 0.11.0 实现：done.states、抑制空 active、error 定位字段。
- KIT-008 / KIT-009 / KIT-010 已在 0.11.0 实现：diagnostics 注入、locale=en / DEFAULT_LABELS_EN、诊断 code 目录。
- KIT-011 为可选增强；宿主可先检查 `send()` 返回值自行报错。
- KIT-012 / KIT-013 / KIT-014 已在 0.12.0 实现；宿主升级 kit 并重新打包即可，不需要改业务代码。

## 0.11.0 实现记录

- KIT-006：`RunnerDoneEvent.states` 由最后一次 microstep 的 `entered` 推导；`done` 前发终态
  `active`，`done` 后抑制空 `active`；
- KIT-007：`RunnerErrorEvent` 增加 `stateId` / `transitionId` / `slot` / `actionIndex` /
  `element`；序列化器写 `data-kit-transition-id`，导入器保留，保证 round-trip；
  错误定位只用 DOM Level 1 API，兼容 `@xmldom/xmldom`，并有 Node 回归用例；
- KIT-008：`CreateEditorOptions.diagnostics` 注入 5 个 formatter；默认仍为中文；
- KIT-009：`locale: 'en'` + `DEFAULT_LABELS_EN`；`labels` 仍可覆盖单个键；
- KIT-010：核心导出 `NAMING_ISSUE_CODES` / `STRUCTURE_ISSUE_CODES` /
  `IMPORT_WARNING_CODES` / `VALIDATION_ISSUE_CODES` / `VARIABLE_WRITE_CODES` /
  `DOCUMENT_STRUCTURE_ERROR_CODES`；`verify-validation` 校验目录与 `docs/messages.md` 一致；
- KIT-011：仍未实现；继续保留 `send(): boolean`，等宿主需要时再加 `trySend`。

## 0.12.0 实现记录

- KIT-014：`ChartCanvas` 拆分 `viewportW/H` 与 `canvasW/H`；固定大画布 + 内容扩容；
  `contentSize()` 改读 `.diagram.offsetWidth/Height`；方向切换 double-rAF + 140ms 兜底 fit；
  fit 下限 0.1；只有作者显式切换方向才自动 fit，侧栏 resize 不重置视图；
- KIT-012：`StructurePanel` 增加 `folded: Set<uid>`，只对 compound/parallel 显示 caret；
  默认展开，过滤强制展开，选中隐藏后代自动展开祖先，文档切换/删除清理；
- KIT-013：`EditorHost` 增加 `.sce-pane` 包装层，折叠按钮绝对定位到分割线中点；
  `aria-expanded`/`aria-label` 同步，按钮不再随左栏滚动；
- 测试：`check-vue` 覆盖折叠/过滤/选中展开与侧栏折叠；`verify-editor` 覆盖 canvas-fit；
  Chromium headless 验证横向 fit、滚轮/左键平移、按钮中点；
- 自定义 JS 提示：`run()` 不再自动弹模态框，显式 `validate()` 才显示脚本清单。


## KIT-016：ProjectDoc `initial` 维护

> 完整记录见 `docs/internal/work-items/0.12-initial-invariant.md`；来源为 Node-RED 宿主
> `docs/kit-bug-report-initial-state.md`，已在 0.12.0 复现。

根因：`EditorStore` 的 `addState` / `removeState` / `setParent` 没有维护
`doc.initial` / `state.initial` 不变量；`serializeToScxml` 的 fallback 掩盖了问题。

建议统一增加 `ensureInitial(doc, parentUid)`，在结构变更后物化 initial；不要删除
serializer fallback。回归要覆盖顶层、compound、parallel、history、删除和移动。
