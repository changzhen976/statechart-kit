# 文档索引

## 宿主集成

- [宿主集成指南](host-integration.md)：选择入口、职责边界、adapter/module、生命周期、安全。
- [Vue 编辑器](editor.md)：`mountEditor` / `EditorAdapter` / `features` / Explorer。
- [EditorModule 契约](editor-modules.md)：右侧标签页、工具栏、外部事件、额外校验、属性字段。
- [会话 typed 事件](session-events.md)：`SessionRunner` 的 send/done/error 契约。
- [诊断消息 code](messages.md)：命名/结构/导入/校验/变量写入。
- [只读预览容器](../preview/README.md)：Docker 预览最新 `.scxml` / `.json`。

## 维护者内部文档

以下内容保留历史阶段、架构复盘、需求记录与发布细节，不作为宿主集成入口：

- [阶段路线图与迁移记录](internal/roadmap.md)
- [架构复盘与风险](internal/architecture-review.md)
- [KIT-001–005 需求记录](internal/kit-requirements.md)
- [npm 发布与宿主切换](internal/releasing.md)
- [历史工作项](internal/work-items/)
