# Changelog

本项目的所有重要变更都记录在此文件中，格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 计划中

- 支持 StartTLS 的显式开关（当前通过 `smtpSecure: false` + 587 端口使用 STARTTLS）。
- 可选 HTML 正文模板。
- 按任务/执行 ID 的静默/重试策略。

## [0.1.0] - 2026-08-22

### Added

- 初始版本。
- 轮询任务看板 Host API，任务执行成功、失败或取消后通过 SMTP 发送邮件。
- 首轮轮询作为基线，不补发历史已完成任务；已通知执行 ID 持久化到 `~/.dsh/email-notify/seen.json`，重启不重复发送。
- Web GUI 设置卡片（设置 → 插件 → 邮件通知）：SMTP 服务器/端口/SSL、发件邮箱、授权码、收件人、主题与正文模板。
- 「发送测试邮件」按钮，配置完成后一键验证。
- 向 Agent 系统提示注入插件说明（可关闭）。
- 所有 API 仅接受 loopback 请求，保护授权码等敏感配置。

[Unreleased]: https://github.com/MCviseron/dsh-email-notify/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/MCviseron/dsh-email-notify/releases/tag/v0.1.0
