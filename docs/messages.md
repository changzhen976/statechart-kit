# 诊断消息 code

core 与 engine 的诊断统一返回 `{ code, params }`，宿主按 `code` 查表本地化，不再对中文字符串做手术。

`statechart-kit/diagnostics/zh` 提供**通用** code 的默认中文格式化（`formatValidationIssue` 等），
`statechart-kit/vue` 与 `scxml-creator` 共用。服务端/MQTT 专属 code（如
`naming.mqtt-var.requires-machine`）由宿主在自己的 formatter 中扩展；其他语言/宿主可整体替换。
本文是公开契约：新增 code 属于向后兼容；修改/删除 code 视为破坏性变更。

宿主可用稳定目录做 i18n 覆盖率测试（从 `statechart-kit` 导出）：

```ts
import {
  NAMING_ISSUE_CODES,
  STRUCTURE_ISSUE_CODES,
  IMPORT_WARNING_CODES,
  VALIDATION_ISSUE_CODES,
  VARIABLE_WRITE_CODES,
} from 'statechart-kit'
```

约定：

- `params` 中的字段可直接插值；缺失可选字段时宿主应回退到通用文案。
- 导入诊断的定位参数 `at` 是 `ImportLocation { stateId, slot? }`，宿主自行拼「状态 X 的 entry」这类文案。
- `stateId` / `stateUid` / `transitionId` / `variableId` / `event` / `slot` / `actionIndex` / `line` 等定位字段
  位于 issue 顶层，不放进 `params`（`ValidationIssue` 另有 `kind` 区分来源层）。
- 引擎自身抛出的错误文本放在 `params.detail`，宿主可原样展示。

## 命名（`NamingIssue` / `DocNamingIssue`）

| code | 级别 | params | 含义 |
| --- | --- | --- | --- |
| `naming.empty` | block | `subject`（event/variable） | 名称为空 |
| `naming.auto-delay` | block | `name` | 手输内部延迟事件名，且未被任何转移以 `delayMs` 引用 |
| `naming.legacy-prefix` | block | `name`, `prefix`, `namespace` | 命中策略的 `legacy` 命名空间（v1 遗留前缀） |
| `naming.prefix.not-for-event` | block | `name`, `prefix`, `namespace`, `hint?` | 该前缀不能用作事件 |
| `naming.prefix.not-for-variable` | block | 同上 | 该前缀不能用作变量 |
| `naming.prefix.warn` | warn | 同上 | 策略声明为警告级；可用 `warnCode` 覆盖 |
| `naming.mqtt-var.requires-machine` | warn | `name`, `prefix`, `namespace` | **宿主示例**：scxml-creator 的 mqv_ 文案，不在 kit 默认 formatter 中 |
| `naming.send.reserved` | block | `name`, `prefix`, `namespace` | 部署闸门：该命名空间禁止手动 `send` |
| `naming.assign.forbidden` | block | `name`, `prefix`, `namespace` | 部署闸门：该命名空间禁止 `assign` |
| `naming.transition.legacy` | block | `name`, `prefix`, `namespace` | 部署闸门：转移事件使用遗留前缀 |

`DocNamingIssue.target` 定位：`datamodel`（`index`/`name`）、`state`（`stateUid`/`stateId`/
`stateLabel`/`slot`/`actionIndex`/`action`）、`transition`（`transitionId`/`event`/`actionIndex?`/`action?`）。

## 结构（`StructureIssue`，core）

| code | 级别 | 含义 |
| --- | --- | --- |
| `structure.state.missing-uid` / `structure.state.duplicate-uid` | error | 内部 uid 缺失/重复（引用键不可靠） |
| `structure.state.missing-id` / `structure.state.invalid-id` / `structure.state.duplicate-id` | error | SCXML id 缺失/非 NCName/重复 |
| `structure.state.self-parent` / `structure.state.missing-parent` / `structure.state.parent-cycle` | error | 父子引用非法/悬空/成环 |
| `structure.state.history-root` / `structure.state.history-children` | error | history 伪态必须有父、不能有子 |
| `structure.state.history-actions` | warning | history 的 entry/exit 会被序列化器丢弃 |
| `structure.state.final-children` / `structure.state.atomic-children` | error | final/atomic 不能有子状态 |
| `structure.state.final-transition` | error | final 不能有出边 |
| `structure.state.donedata-not-final` | error | donedata 只允许出现在 final 状态 |
| `structure.state.donedata-empty` | error | donedata 的 content/expr 为空，或没有任何形态 |
| `structure.state.donedata-ambiguous` | error | content / expr / param 多种形态并存 |
| `structure.state.donedata-param-invalid` | error | param 缺少 name / name 非 NCName / 缺 expr |
| `structure.state.donedata-param-duplicate` | error | 同一個 donedata 内 param name 重复 |
| `structure.state.compound-empty` | warning | 复合状态没有子状态 |
| `structure.state.parallel-initial` | warning | parallel 的 initial 会被忽略 |
| `structure.state.initial-ignored` | warning | 非 compound 状态的 initial 会被忽略 |
| `structure.state.initial-fallback` | warning | 未指定 initial，序列化器回退第一个子状态 |
| `structure.state.initial-missing` / `structure.state.initial-not-child` | error | initial 指向不存在/非直接子状态 |
| `structure.state.initial-history` | warning | initial 指向 history，序列化时回退 |
| `structure.root.initial-missing` / `structure.root.initial-not-top` | error | 根 initial 不存在/不是顶层状态 |
| `structure.variable.missing-id` / `structure.variable.invalid-id` / `structure.variable.duplicate-id` | error | datamodel 变量 id 非法 |
| `structure.transition.missing-id` / `structure.transition.duplicate-id` | warning | 内部转移 id 缺失/重复 |
| `structure.transition.missing-source` / `structure.transition.missing-target` | error | 转移端点悬空（`missing-target` 仅检查非 null target） |
| `structure.transition.history-targetless` | error | history 的默认转移必须有 target |
| `structure.transition.internal-eventless` | warning | 无 target 且无事件，可能形成自激循环 |
| `structure.transition.delay-invalid` | error | `delayMs` 非有限值或 < 10 |
| `structure.transition.delay-without-event` | error | 有 `delayMs` 但没有事件名 |

## SCXML 导入（`ImportWarning` / `ScxmlImportError`）

| code | params | 含义 |
| --- | --- | --- |
| `import.action.missing-event` | `at`, `tag` | `<send>/<raise>` 缺 event，已跳过 |
| `import.send.external-target` | `at`, `tag`, `event` | 外部 target 按本机 send 处理 |
| `import.send.params-ignored` | `at`, `tag`, `event` | `<param>` 映射被忽略 |
| `import.action.missing-sendid` / `import.action.missing-location` | `at` | cancel/assign 缺属性，已跳过 |
| `import.action.unsupported` | `at`, `tag` | if/elseif/else/foreach 暂不支持 |
| `import.action.unknown` | `at`, `tag` | 未知可执行元素，已跳过 |
| `import.state.missing-id` | `id` | 状态缺 id，自动命名 |
| `import.state.duplicate-id` | `id`, `renamed` | 状态 id 重复，已改名 |
| `import.element.unsupported` | `at`, `tag` | invoke 等暂不支持 |
| `import.donedata.empty-expr` / `import.donedata.empty-content` | `at` | donedata 的 content/expr 为空 |
| `import.donedata.param-invalid` | `at`, `index`, `name?` | param 缺 name 或 expr |
| `import.donedata.ambiguous` | `at`, `forms` | content/expr/param 多形态并存，已尽力保留 |
| `import.donedata.unsupported-child` | `at`, `tag` | donedata 内未知子元素，已忽略 |
| `import.initial.not-child` / `import.initial.missing-target` | `at`, `initial` | initial 指向非子状态/不存在 |
| `import.transition.multi-target` | `at`, `target`, `taken` | fork 多 target，取第一个 |
| `import.transition.missing-target` | `at`, `target` | target 不存在，已跳过 |
| `import.transition.type-invalid` | `at`, `type` | type 不是 internal/external，已忽略 |
| `import.root-initial.missing-target` | `initial` | 根 initial 指向不存在状态 |
| `import.no-dom-parser` | — | Node 环境未注入 DOMParser（异常） |
| `import.parse-error` | `detail` | XML 解析失败（异常） |
| `import.root-not-scxml` | `tag` | 根元素不是 `<scxml>`（异常） |

> 0.9.0 起 `import.transition.no-target` 不再发出：无 target 的转移会保留为
> `target: null`（内部转移）。宿主旧格式化映射可保留，但不会再收到该 code。

## 校验（`ValidationIssue`，engine）

| code | params | 含义 |
| --- | --- | --- |
| `validation.engine.problem` | `detail` | 引擎 `compile` 报告的单条结构问题 |
| `validation.engine.error` | `detail` | 引擎抛出的其他错误（含 XML 解析） |
| `validation.script-action` | `slot`, `event`, `index`, `line` | 文档含自定义 JS 动作（部署闸门用） |

`validateDocument` 会把结构/命名问题转换为同一 `ValidationIssue`，`kind` 分别为
`structure` / `naming`；编辑器模块的额外校验为 `kind='module'`。`severity` 为 `error` 或
`warning`，只有 error 阻断。

## 序列化（`DocumentStructureError`）

| code | 附加字段 | 含义 |
| --- | --- | --- |
| `document.invalid-structure` | `issues: StructureIssue[]` | `serializeChecked()` 发现 error 级结构问题，拒绝生成可能被运行时误读的 SCXML |

## 变量写入（`VariableWriteResult`，engine）

| code | params | 含义 |
| --- | --- | --- |
| `variable.assign-expr` | `id`, `expr` | 表达式求值成功并写回 |
| `variable.assign-value` | `id`, `value` | 直接写入成功 |
| `variable.session-not-running` | `id` | 会话未启动/已停止 |
| `variable.unknown` | `id` | 变量不在 datamodel 中 |
| `variable.assign-failed` | `id`, `detail` | 引擎求值/写入失败；`detail` 为上游原文 |
