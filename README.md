<p align="center">
  <h1 align="center">📧 dsh-email-notify</h1>
  <p align="center"><b>任务完成时，让 DeepSeek Harness 替你发一封邮件。</b></p>
  <p align="center">
    <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> 的开源任务通知插件 ·
    简体中文 · <a href="./README.en.md">English</a>
  </p>
  <p align="center">
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square" alt="Apache-2.0"></a>
    <a href="https://github.com/MCviseron/dsh-email-notify/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/MCviseron/dsh-email-notify/ci.yml?branch=main&style=flat-square&label=CI" alt="CI"></a>
    <a href="https://github.com/MCviseron/dsh-email-notify/releases"><img src="https://img.shields.io/github/v/release/MCviseron/dsh-email-notify?sort=semver&style=flat-square" alt="GitHub release"></a>
    <img src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  </p>
</p>

`dsh-email-notify` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的邮件通知插件：它监听**任务看板**（`dsh-task-board`）的执行结算，当任务**成功、失败或取消**时，通过 SMTP（默认 QQ 邮箱，也支持任意 SMTP 服务）自动发送一封邮件给你。

```text
任务看板结算 → Host 轮询 /api/task-board/state → 与 seen.json 比对
    → 渲染主题/正文模板 → SMTP 发送邮件 → 浏览器侧设置卡片
```

## ✨ 特性

- 🔔 **任务完成自动通知**：任务执行成功、失败、取消后各发一封邮件，无需人工盯看板。
- 🧵 **基线防补发**：插件启动后的第一轮轮询只建立基线，不会补发历史已完成任务。
- 💾 **去重持久化**：已通知的执行 ID 保存在 `~/.dsh/email-notify/seen.json`，Host 重启后不会重复发信。
- 🎛️ **Web GUI 设置卡片**：在「设置 → 插件 → 邮件通知」中完成全部配置，无需手改配置文件。
- 📨 **一键测试邮件**：配置完成后点一下按钮即可验证 SMTP 是否可用。
- 🧩 **模板变量**：主题与正文支持 `{{taskTitle}}`、`{{resultText}}`、`{{durationText}}` 等变量。
- 👥 **多收件人**：收件人支持逗号、分号或换行分隔。
- 🔒 **安全优先**：所有 HTTP API 仅接受 loopback 请求；授权码以 secret 声明，浏览器侧脱敏显示。
- 🤖 **Agent 公告可关**：默认向 Agent 系统提示注入插件说明，可在设置中关闭。

## 📦 安装

### 前置依赖

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（含 Web GUI）
- Node.js `^22.19.0 || >=24`
- pnpm `10.x`
- 任务看板插件（`dsh-task-board`）已启用——本插件监听的就是任务看板的执行结算

### 从源码安装

```sh
git clone https://github.com/MCviseron/dsh-email-notify.git
cd dsh-email-notify
pnpm install      # prepare 钩子会自动执行 pnpm build
dsh plugin --profile web add "$PWD"
```

> Windows Git Bash 下 `$PWD` 会展开为绝对路径；如果 `dsh` CLI 不在 PATH 中，可改用：
>
> ```sh
> npx -y @deepseek-ai/dsh plugin --profile web add "$PWD"
> ```

安装完成后校验并重启：

```sh
dsh --profile web --dump-config   # 确认 bundle 中包含 dsh-email-notify
dsh web
```

刷新 Web GUI，进入「设置 → 插件」，即可看到「邮件通知」卡片。

### 卸载

```sh
dsh plugin --profile web remove dsh-email-notify
```

卸载后刷新 Web GUI 即可；本地源码目录不会被删除。

## 🚀 快速开始（QQ 邮箱）

1. 登录 QQ 邮箱 → **设置 → 账户**。
2. 找到「POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV 服务」，**开启 SMTP 服务**。
3. 按提示发送短信后生成一个**授权码**——它不是 QQ 登录密码。
4. 打开 Web GUI「设置 → 插件 → 邮件通知」，填写：

   | 字段 | 值 |
   | --- | --- |
   | SMTP 服务器 | `smtp.qq.com` |
   | SMTP 端口 | `465` |
   | 使用 SSL/TLS | 开 |
   | 发件邮箱 | `你的QQ号@qq.com` |
   | 邮箱授权码 | 第 3 步生成的授权码 |
   | 发件人地址 | `你的QQ号@qq.com` 或 `DSH 通知 <你的QQ号@qq.com>` |
   | 收件人 | 接收通知的邮箱（可多个） |

5. 点击 **「发送测试邮件」**，收到邮件即配置成功。

> 使用 587 端口 + STARTTLS 时：SMTP 端口填 `587`，**关闭**「使用 SSL/TLS」。
> 其他邮箱服务商（Gmail、Outlook、163 等）只需替换 SMTP 服务器、端口与凭据。

## ⚙️ 设置项

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| 启用插件 | `true` | 关闭后不轮询、不发信 |
| 向 Agent 公告本插件 | `true` | 在系统提示中注入插件能力说明 |
| 监听任务看板 | `true` | 任务执行结算后发信 |
| 轮询间隔（毫秒） | `5000` | 检查任务看板状态的频率，最小 1000 |
| SMTP 服务器 | `smtp.qq.com` | 任意 SMTP 服务 |
| SMTP 端口 | `465` | QQ 邮箱 SSL；STARTTLS 常用 587 |
| 使用 SSL/TLS | `true` | 465 开；587 + STARTTLS 关 |
| 发件邮箱 | 空 | SMTP 登录账号 |
| 邮箱授权码 | 空 | **不是登录密码**；留空时不发送任何邮件 |
| 发件人地址 | 空 | 可写作 `名称 <邮箱>` |
| 收件人 | 空 | 逗号/分号/换行分隔 |
| 主题模板 | `[DSH 任务完成] {{taskTitle}} - {{resultText}}` | 支持模板变量 |
| 正文模板 | 见默认值 | 支持模板变量 |

## 🧩 模板变量

主题与正文模板支持以下变量（不存在的变量会被替换为空字符串）：

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `{{taskTitle}}` | 任务标题 | `清理临时文件` |
| `{{result}}` | 原始结果标识 | `succeeded` / `failed` / `cancelled` |
| `{{resultText}}` | 结果中文文案 | `成功` / `失败` / `已取消` |
| `{{taskId}}` | 任务 ID | `task-123` |
| `{{executionId}}` | 执行 ID | `exec-456` |
| `{{startedAt}}` | 开始时间（本地时区） | `2026/8/22 14:30:00` |
| `{{endedAt}}` | 结束时间（本地时区） | `2026/8/22 14:35:12` |
| `{{durationText}}` | 耗时 | `5 分钟 12 秒` |
| `{{error}}` | 错误信息 | `timeout` |

## 🔧 工作原理

1. Host 侧 `EmailNotifier` 按 `pollIntervalMs` 轮询任务看板 Host API（`/api/task-board/state`）。
2. 第一轮成功拉取只作为**基线**：把已结束的执行记录进 seen 集合，不发送邮件。
3. 之后的轮询中，新出现的已结束执行（成功/失败/取消）会渲染主题与正文模板，通过 `nodemailer` 发送。
4. 已通知执行 ID 写入 `~/.dsh/email-notify/seen.json`，重启不重发。
5. Web 侧设置卡片通过插件自带的 loopback 设置桥读写配置，并调用「测试邮件」接口。

```text
┌─────────────────┐   poll    ┌──────────────────────┐
│  dsh-task-board │ ◀───────  │  EmailNotifier (Host) │
└─────────────────┘           └──────────┬───────────┘
                                         │ diff + 渲染模板
                                         ▼
                               ┌──────────────────────┐
                               │  SMTP (nodemailer)    │
                               └──────────────────────┘
```

## 🔒 安全说明

- 插件所有 HTTP API（测试邮件、设置读写）仅接受 **loopback** 请求，并校验 Host 头与同源 Origin，不信任 `X-Forwarded-For`。
- SMTP 授权码以 `role('secret')` 声明：浏览器读取配置时**脱敏**（显示为空），真实授权码不会回传前端。
- 已通知执行 ID 与收件人等状态保存在用户主目录私有路径，不写入仓库。
- 如发现安全问题，请参考 [SECURITY.md](./SECURITY.md)，**不要在公开 Issue 中粘贴真实授权码**。

## 🗂️ 项目结构

```text
dsh-email-notify/
├── src/
│   ├── index.ts                  # 插件入口：配置、系统提示、路由注册
│   ├── notifier.ts               # 轮询任务看板、去重、模板渲染、发信
│   ├── mailer.ts                 # nodemailer 封装、收件人解析、配置校验
│   ├── routes.ts                 # 测试邮件 / 设置桥接 HTTP API
│   ├── loopback.ts               # loopback 请求校验
│   └── client/                   # Web GUI 设置卡片（React）
│       ├── index.ts
│       ├── EmailNotifySettingsCard.tsx
│       ├── locales.ts            # 中英文案
│       └── settings-scope.ts     # 设置桥接客户端
├── lib/                          # 构建产物（git 忽略，pnpm build 生成）
├── cordis.patch.yml              # DSH bundle patch
├── build.mjs                     # esbuild 构建脚本
└── package.json
```

## 🛠️ 开发

```sh
pnpm install      # 安装依赖（prepare 钩子自动构建）
pnpm typecheck    # TypeScript 类型检查
pnpm build        # 构建 lib/index.js 与 lib/client.js
pnpm check        # typecheck + build
```

提交 PR 前请保证 `pnpm check` 通过；CI 会在 GitHub Actions 上自动执行相同的检查。

更多约定见 [CONTRIBUTING.md](./CONTRIBUTING.md)，变更历史见 [CHANGELOG.md](./CHANGELOG.md)。

## ❓ 常见问题

**测试邮件发送失败？**

- 确认使用的是**邮箱授权码**而不是登录密码。
- 465 端口请开启「使用 SSL/TLS」；587 端口请关闭并确认服务商支持 STARTTLS。
- 确认「发件人地址」非空，格式可为 `name@example.com` 或 `名称 <name@example.com>`。
- 检查网络/防火墙是否能访问 SMTP 服务器（QQ 邮箱一般无需代理）。

**任务完成了但没收到邮件？**

- 确认「监听任务看板」已开启，且任务看板插件本身已启用。
- 确认插件是在任务结算**之后**才开始轮询的；启动前的历史任务属于基线，不会补发（这是设计行为）。
- 查看 Host 日志中是否有 `[dsh-email-notify]` 开头的错误。
- 如果想重新发送某次执行，可删除 `~/.dsh/email-notify/seen.json` 后重启 Host（会重新建立基线）。

## 📄 License

[Apache-2.0](./LICENSE)
