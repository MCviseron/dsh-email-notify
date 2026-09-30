# Changelog

本项目的所有重要变更都记录在此文件中，格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 计划中

- 支持 StartTLS 的显式开关（当前通过 `smtpSecure: false` + 587 端口使用 STARTTLS）。
- 可选 HTML 正文模板（当前 HTML 由纯文本模板生成）。
- 按任务/执行 ID 的静默/重试策略。
- 审批提醒支持自定义变量扩展。

## [0.4.0] - 2026-10-01

### Added

- **对话完成通知**：在对话输入框左侧（`conversation.input.left`）新增「邮件通知」勾选，当前会话每完成一轮（`turn/end`）自动发送完成邮件。
- **审批邮件提醒**：设置中新增「审批邮件提醒」（默认关闭），监听 `approval/request` waterfall，在等待用户审批时发送包含审批提示内容的提醒邮件；可分别开关「工作区审批提醒」和「Auto review 转手动审批提醒」两种模式。
- 新增 `/api/dsh-email-notify/approval/availability` loopback 接口，用于向设置页暴露 auto review 插件是否可用；未安装/未启用官方 auto review 插件时不提供 Auto review 转手动审批提醒选项。
- 新增 `/api/dsh-email-notify/conversation-notify/describe` 与 `/api/dsh-email-notify/conversation-notify/set` 两个 loopback 接口，用于读取/写入按会话的勾选状态。
- 勾选状态持久化到 `~/.dsh/email-notify/notify-sessions.json`。
- 设置页从「Web UI 插件」子级迁移到 DSH 设置侧边栏的一级 `settings.section`。
- **通知模板独立化**：任务通知沿用原 `subjectTemplate`/`bodyTemplate`；新增对话通知与审批通知各自的主题/正文模板（`conversationSubjectTemplate`、`conversationBodyTemplate`、`approvalSubjectTemplate`、`approvalBodyTemplate`），默认值与当前格式一致。

### Changed

- `EmailNotifier.applyConfig` 仅在 `enabled && watchTaskBoard` 时启动轮询定时器；仅使用对话完成通知时不再空转任务看板轮询。
- **修复测试邮件/模板渲染报 `source.replace is not a function`**：DSH 0.2 的 `.volatile()` Config 字段以带 `get()` 的冻结引用传入，插件现在会先展开这些引用再渲染模板、解析端口与配置。
- 更新插件公告文本，向 Agent 说明对话勾选与一级设置页。
- `src/client/index.ts` 增加 `conversation.input.left` 的 SlotMap 类型补丁；`src/index.ts` 增加 `session/event` 与 `approval/request` 的 Cordis Events 类型补丁，修复 `tsc --noEmit`。
- `EmailNotifyConfig` 新增 `approvalNotifyEnabled`、`approvalNotifyWorkspace`、`approvalNotifyAutoReview` 三个 volatile 字段。
- 审批提醒模式名称改为「工作区审批提醒」与「Auto review 转手动审批提醒」，避免与 auto review 本身的开关混淆。
- 审批提醒邮件正文改为更易读的通知格式；邮件 HTML 统一由渲染后的纯文本生成，模板改动会同时反映到纯文本与 HTML 正文。
- 任务通知模板字段名在设置页改为「任务通知主题模板 / 任务通知正文模板」，避免与对话、审批模板混淆。
- 审批提醒新增 `approval/asked` 会话事件兜底路径（延迟 500ms，瀑布路径优先），并在设置桥之外新增 `GET/POST /api/dsh-email-notify/approval/status` 诊断接口，暴露已观察/已发送计数与最近一次审批摘要。
- 中英文案与 README 对齐新功能。

## [0.3.0] - 2026-09-30

### Added

- **兼容 DSH `0.2.0-rc.x` 与官方桌面端**：同一份构建现在覆盖 `0.1.1-rc.x` / `0.1.5-rc.x` / `0.2.0-rc.x` 三代运行时，切换运行时不需换插件版本。

### Changed

- **设置接缝三代表探测**：0.2 的 `SettingsForms` 走 `configure({ auto: false })`（命名空间即 profile entry Config，并关掉自动生成页），旧版依次回退 `installSection` / `register`。
- `Config` 的 13 个字段全部标记 `.volatile()`：0.2 只把这些字段投影成可编辑表单；该标记在旧接缝上无副作用。
- schema 依赖由 `schemastery` 换成 `@deepseek-ai/schemastery`（与运行时加载 Config 的包一致）。
- `src/routes.ts` 不再 import 0.2 已移除的 `SettingsProvider`，改用本地 `SettingsBridge`/`SettingsBridgeView` 结构类型，`sctx.settings` 在调用点显式转型。
- 设置冲突判定改为「类 + `code === 'SETTINGS_CONFLICT'`」：插件自带的 dsh-settings 副本与宿主抛错的副本不是同一份，单靠 `instanceof` 会漏判（同时修掉 0.1.5 上的同类隐患）。
- 客户端 `SettingsScope`/`SettingsScopeSnapshot` 类型本地化（0.2 已改名 `ConfigForm`/`ConfigFormSnapshot`，成员一致）。
- 对等依赖范围扩到 `^0.1.1-rc.2 || ^0.1.5-rc.2 || ^0.2.0-rc.2`；构建期新增 `zustand@4.4.7`、`immer@10.2.0`（内联快照存储）。

### Verified

- 0.1.5-rc.2 / 0.2.0-rc.2 双份 `tsc --noEmit` 与构建通过。
- 隔离 `DSH_HOME` 下用 0.2 运行时启动 web profile：插件加载无报错，`POST /api/dsh-email-notify/settings/describe` 返回完整 schema 与 `value`/`base`/`user`/`secrets`；测试邮件路由按预期返回「配置不完整」。

## [0.2.0] - 2026-09-17

### Added

- **兼容 DSH 0.1.5-rc.x**：同一份构建现在同时支持 DSH `0.1.1-rc.x` 与 `0.1.5-rc.x` 两代运行时，升级 DSH 前后都不需要更换插件版本。

### Changed

- 浏览器端不再依赖 DSH 客户端运行时包：快照存储 `createSnapshotStore` 改为随插件打包，`lib/client.js` 的运行时依赖只剩 Web 外壳内置的 `react` 与 `react/jsx-runtime`。原 `@deepseek-ai/dsh-client-runtime` 自 DSH 0.1.2 起被上游移除，`@deepseek-ai/dsh-client-store` 是 0.1.5 才有的平台模块，内联后两代外壳都能加载。
- 客户端类型来源迁移：`ClientContext` 改用 `@deepseek-ai/cordis`，`SettingsScope` / `SettingsScopeSnapshot` 改用 `@deepseek-ai/dsh-client-ui-settings/client`（`ctx.slots` 的类型增补由 `@deepseek-ai/dsh-client-ui-renderer/client` 提供）。
- 宿主端设置接缝改为运行时探测：DSH 0.1.5 用 `settings.installSection(owner, ns, schema, entry, hooks)`；旧版回退到 `settings.register(ns, schema, { base })` 的等价接线，与上游已移除的自由函数 `installSettingsSection` 行为一致（同样的 `setSource` 时机、`onChange` 触发点与卸载保护）。
- 设置命名空间常量 `EMAIL_NOTIFY_SETTINGS_NAMESPACE` 现在是普通字符串 `'email-notify'`（上游移除了 `settingsNamespace()` 校验函数，该 id 本身合法）。
- 浏览器端设置作用域补齐 0.1.5 契约新增的 `mutate(ops, expectedRevision)`：直接复用既有桥接写路径（`/api/dsh-email-notify/settings/mutate` 本就接受 `ops` 数组），`set` / `unset` 行为不变。
- 依赖声明：`dsh.client.inject` 收敛为两代都存在的 `@deepseek-ai/dsh-client-ui-settings` 与 `@deepseek-ai/dsh-client-locale`；`@deepseek-ai/dsh-*` 对等依赖范围为 `^0.1.1-rc.2 || ^0.1.5-rc.2`，`@deepseek-ai/cordis` 为 `^4.0.1`。

### 兼容性说明

- 功能、配置字段与行为完全不变：设置卡片、SMTP 发送、任务看板轮询、已通知执行 ID 记录（`~/.dsh/email-notify/seen.json`）都与 0.1.0 一致。
- 自托管设置桥 `/api/dsh-email-notify/settings/*` 仍只接受 loopback 请求。

## [0.1.0] - 2026-08-22

### Added

- 初始版本。
- 轮询任务看板 Host API，任务执行成功、失败或取消后通过 SMTP 发送邮件。
- 首轮轮询作为基线，不补发历史已完成任务；已通知执行 ID 持久化到 `~/.dsh/email-notify/seen.json`，重启不重复发送。
- Web GUI 设置卡片（设置 → 插件 → 邮件通知）：SMTP 服务器/端口/SSL、发件邮箱、授权码、收件人、主题与正文模板。
- 「发送测试邮件」按钮，配置完成后一键验证。
- 向 Agent 系统提示注入插件说明（可关闭）。
- 所有 API 仅接受 loopback 请求，保护授权码等敏感配置。

[Unreleased]: https://github.com/MCviseron/dsh-email-notify/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/MCviseron/dsh-email-notify/releases/tag/v0.3.0
[0.2.0]: https://github.com/MCviseron/dsh-email-notify/releases/tag/v0.2.0
[0.1.0]: https://github.com/MCviseron/dsh-email-notify/releases/tag/v0.1.0
