# 抽取路线图

把 `scxml-creator` 与 `node-red-contrib-scxmljs` 共用的状态机逻辑下沉到本包。

**不在范围内**：渲染器本身（属于 `@tinyactors/scxmljs`）、全局变量注册表、MQTT 桥、
时钟服务、事件路由、Fastify REST、Node-RED 节点与总线。

| 阶段 | 内容 | 估时 | 状态 |
| --- | --- | --- | --- |
| P0 | 仓骨架、构建链（ESM + d.ts）、逐字快照、基线冻结、打包冒烟、CI | 0.5–1 人日 | ✅ 完成（v0.1.0） |
| P1 | 命名策略 `NamingPolicy` 注入；校验分层；core 文案 code 化；`events.ts` 拆分 | 3–4 人日 | 待开始 |
| P2 | `engine` 补齐 `scriptTimeoutMs` / `maxMicrosteps` / `data` 预置与 trusted/sandboxed 选择；合并懒加载器 | 1.5–2 人日 | 待开始 |
| P3 | Vue 编辑器抽离：`EditorHost`、`features`、`mountEditor`、样式随包 | 6–8 人日 | 待开始 |
| P4 | `scxml-creator` 切换到本包，删除本地副本 | 2–3 人日 | 待开始 |
| P5 | `node-red-contrib-scxmljs` 切换到本包，删除 vendor 与 17 条构建期替换 | 3–4 人日 | 待开始 |
| P6 | 发布与治理：版本策略、CHANGELOG、发布流水线 | 1.5–2 人日 | 待开始 |

关键路径：P0 → P1 → P2 → P3 → P5（最短约 14 人日）。P4 与 P5 在 P3 之后可并行。

## P0 的产出与边界

- **逐字快照，零行为改动**：`src/core` 7 文件 + `src/engine` 1 文件 + `test` 3 脚本。
- **一致性可验证**：`docs/baseline.json` 记录 sha256 与 donor commit；`check:baseline` 检测手改与 donor 前进。
- **发布物可验证**：`check:pack` 真的打包、解包、按 exports map 导入并跑一次序列化。
- **刻意未搬**：见 `docs/baseline.json` 的 `excluded`。其中 `validator.ts` 是 P1 的首要目标
  ——它目前静态依赖引擎，是「纯核心不纯」的根源。

## P1 的设计约束（提前记下，避免走偏）

1. core 必须保持零运行时依赖：`validateStructure(doc)` 不能 import 引擎。
2. 命名规则不能硬编码 `gv_`/`mqe_` 等服务端语义：宿主传入 `NamingPolicy`，core 只提供 `BASE_POLICY`。
3. 文案返回 `{ code, params }`，不要返回中文字符串——否则消费方只能做字符串手术。
4. 以上三条全部由现有三个测试套件 + 新增策略测试守护，保证 P1 是重构而非重写。

## 消费方同步

| 仓库 | 现状 | 切换点 |
| --- | --- | --- |
| `scxml-creator` | 自带 `src/core`、`src/engine` | P4 |
| `node-red-contrib-scxmljs` | `src/vendor/scxml-core`（手动 `sync-vendor`）+ 17 条压缩产物替换 | P5 |
