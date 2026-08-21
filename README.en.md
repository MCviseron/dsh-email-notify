<p align="center">
  <h1 align="center">📧 dsh-email-notify</h1>
  <p align="center"><b>Let DeepSeek Harness email you when a task finishes.</b></p>
  <p align="center">
    <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> email-notification plugin ·
    <a href="./README.md">简体中文</a> · English
  </p>
  <p align="center">
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square" alt="Apache-2.0"></a>
    <a href="https://github.com/MCviseron/dsh-email-notify/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/MCviseron/dsh-email-notify/ci.yml?branch=main&style=flat-square&label=CI" alt="CI"></a>
    <a href="https://github.com/MCviseron/dsh-email-notify/releases"><img src="https://img.shields.io/github/v/release/MCviseron/dsh-email-notify?sort=semver&style=flat-square" alt="GitHub release"></a>
    <img src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  </p>
</p>

`dsh-email-notify` is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin that watches the **task board** (`dsh-task-board`) and sends an SMTP email (QQ Mail by default; any SMTP provider works) whenever a task execution **succeeds, fails, or is cancelled**.

```text
task-board settlement → Host polls /api/task-board/state → diff against seen.json
    → render subject/body templates → send via SMTP → Web GUI settings card
```

## ✨ Features

- 🔔 **Automatic task notifications** — one email per settled execution (succeeded / failed / cancelled).
- 🧵 **Baseline, no history spam** — the first poll only records existing executions; nothing is back-sent.
- 💾 **Deduplicated & persisted** — notified execution IDs are stored in `~/.dsh/email-notify/seen.json`, so a Host restart never re-sends.
- 🎛️ **Web GUI settings card** — configure everything under Settings → Plugins → Email Notify, no manual config files.
- 📨 **One-click test email** — verify your SMTP settings immediately.
- 🧩 **Template variables** — `{{taskTitle}}`, `{{resultText}}`, `{{durationText}}`, and more.
- 👥 **Multiple recipients** — comma, semicolon, or newline separated.
- 🔒 **Security first** — every HTTP API is loopback-only; the SMTP authorization code is a redacted secret in the browser.
- 🤖 **Agent announcement toggle** — plugin guidance is injected into the system prompt by default and can be disabled.

## 📦 Install

### Prerequisites

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) with Web GUI
- Node.js `^22.19.0 || >=24`
- pnpm `10.x`
- The task-board plugin (`dsh-task-board`) enabled

### From source

```sh
git clone https://github.com/MCviseron/dsh-email-notify.git
cd dsh-email-notify
pnpm install      # the prepare hook runs pnpm build automatically
dsh plugin --profile web add "$PWD"
```

Verify and restart:

```sh
dsh --profile web --dump-config   # confirm dsh-email-notify is in the bundle
dsh web
```

Refresh the Web GUI — the "Email Notify" card appears under Settings → Plugins.

### Uninstall

```sh
dsh plugin --profile web remove dsh-email-notify
```

## 🚀 Quick start (QQ Mail)

1. Open QQ Mail → **Settings → Account**.
2. Enable **SMTP service** (POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV section).
3. Generate an **authorization code** after the SMS verification — it is *not* your QQ password.
4. In the Web GUI settings card, fill in:

   | Field | Value |
   | --- | --- |
   | SMTP host | `smtp.qq.com` |
   | SMTP port | `465` |
   | Use SSL/TLS | On |
   | Sender email | `your-qq-number@qq.com` |
   | Authorization code | the code from step 3 |
   | From address | `your-qq-number@qq.com` or `DSH Notify <your-qq-number@qq.com>` |
   | Recipients | one or more email addresses |

5. Click **Send test email**. If it arrives, you are done.

> For port 587 + STARTTLS: set port `587` and turn **off** "Use SSL/TLS".
> Other providers (Gmail, Outlook, 163, …) only need different SMTP host/port/credentials.

## ⚙️ Settings

| Setting | Default | Description |
| --- | --- | --- |
| Enable plugin | `true` | Stop polling and sending when off |
| Announce to Agent | `true` | Inject plugin guidance into the system prompt |
| Watch task board | `true` | Send mail when an execution settles |
| Poll interval (ms) | `5000` | Task-board polling frequency; minimum 1000 |
| SMTP host | `smtp.qq.com` | Any SMTP service |
| SMTP port | `465` | SSL for QQ Mail; STARTTLS commonly 587 |
| Use SSL/TLS | `true` | On for 465; off for 587 + STARTTLS |
| Sender email | empty | SMTP login account |
| Authorization code | empty | **Not your password**; no mail is sent while empty |
| From address | empty | e.g. `Name <email>` |
| Recipients | empty | comma / semicolon / newline separated |
| Subject template | `[DSH 任务完成] {{taskTitle}} - {{resultText}}` | Supports template variables |
| Body template | see default | Supports template variables |

## 🧩 Template variables

| Variable | Description | Example |
| --- | --- | --- |
| `{{taskTitle}}` | Task title | `Clean temp files` |
| `{{result}}` | Raw result | `succeeded` / `failed` / `cancelled` |
| `{{resultText}}` | Human-readable result | `成功` / `失败` / `已取消` |
| `{{taskId}}` | Task ID | `task-123` |
| `{{executionId}}` | Execution ID | `exec-456` |
| `{{startedAt}}` | Start time (local) | `2026/8/22 14:30:00` |
| `{{endedAt}}` | End time (local) | `2026/8/22 14:35:12` |
| `{{durationText}}` | Duration | `5 分钟 12 秒` |
| `{{error}}` | Error message | `timeout` |

## 🔧 How it works

1. The Host-side `EmailNotifier` polls `/api/task-board/state` every `pollIntervalMs`.
2. The first successful snapshot is a **baseline**: settled executions are recorded but not emailed.
3. Later polls diff against the seen set and email newly settled executions through `nodemailer`.
4. Seen execution IDs are persisted to `~/.dsh/email-notify/seen.json` — no duplicates after restart.
5. The Web settings card reads/writes config through the plugin's own loopback settings bridge and calls the test-mail endpoint.

## 🔒 Security

- All HTTP APIs are **loopback-only** and verify the Host header and same-origin Origin; `X-Forwarded-For` is never trusted.
- The SMTP authorization code is a `role('secret')` field: the browser receives it redacted (empty), never the real value.
- State files live under the user home directory, never in the repository.
- See [SECURITY.md](./SECURITY.md); never paste real credentials into public issues.

## 🛠️ Development

```sh
pnpm install      # installs deps and builds via the prepare hook
pnpm typecheck    # TypeScript type check
pnpm build        # builds lib/index.js and lib/client.js
pnpm check        # typecheck + build
```

PRs should pass `pnpm check`; CI runs the same checks on GitHub Actions.

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CHANGELOG.md](./CHANGELOG.md).

## ❓ FAQ

**Test email fails?**

- Make sure you use the **authorization code**, not your login password.
- Port 465: enable "Use SSL/TLS". Port 587: disable it and confirm STARTTLS support.
- Make sure "From address" is not empty (e.g. `name@example.com` or `Name <name@example.com>`).
- Check firewall/network access to the SMTP host.

**Task finished but no email?**

- Make sure "Watch task board" is on and the task-board plugin itself is enabled.
- Executions settled *before* the first poll belong to the baseline and are intentionally not emailed.
- Check Host logs for lines starting with `[dsh-email-notify]`.
- To re-send an execution, delete `~/.dsh/email-notify/seen.json` and restart the Host (a new baseline is built).

## 📄 License

[Apache-2.0](./LICENSE)
