<p align="center">
  <h1 align="center">📧 dsh-email-notify</h1>
  <p align="center"><b>Let DeepSeek Harness email you when work finishes.</b></p>
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

`dsh-email-notify` is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin with two email triggers:

1. **Task-board settlement** — watches the task board (`dsh-task-board`) and sends an SMTP email (QQ Mail by default; any SMTP provider works) whenever a task execution **succeeds, fails, or is cancelled**.
2. **Conversation completion** — check "Email Notify" on the left side of the conversation input and the current session emails you after every completed turn.

```text
task-board settlement → Host polls /api/task-board/state → diff against seen.json
                 → render subject/body templates → send via SMTP
conversation turn/end → Host checks notify-sessions.json → send completion email
                 → first-level settings page + per-session input checkbox
```

## ✨ Features

- 🔔 **Automatic task notifications** — one email per settled execution (succeeded / failed / cancelled).
- 💬 **Conversation completion notifications** — check "Email Notify" in the conversation input; the current session emails after every completed turn. The per-session checkbox is persisted.
- ⏳ **Approval email reminder** — when enabled in settings, email while a request is waiting for user approval; choose Workspace approval reminder and/or Auto review escalation reminder. Off by default.
- 🧵 **Baseline, no history spam** — the first task-board poll only records existing executions; nothing is back-sent.
- 💾 **Deduplicated & persisted** — notified execution IDs are stored in `~/.dsh/email-notify/seen.json`, so a Host restart never re-sends; per-session checkbox state lives in `~/.dsh/email-notify/notify-sessions.json`.
- 🎛️ **First-level settings page** — appears directly in the DSH settings sidebar as "Email Notify", not under Web UI plugins.
- 📨 **One-click test email** — verify your SMTP settings immediately.
- 🧩 **Customisable templates** — separate subject/body templates for task, conversation and approval notifications, pre-filled with the current formats.
- 👥 **Multiple recipients** — comma, semicolon, or newline separated.
- 🔒 **Security first** — every HTTP API is loopback-only; the SMTP authorization code is a redacted secret in the browser.
- 🤖 **Agent announcement toggle** — plugin guidance is injected into the system prompt by default and can be disabled.

## 📦 Install

### Prerequisites

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) with Web GUI — DSH `0.1.1-rc.x` / `0.1.5-rc.x` / `0.2.0-rc.x`; one build serves all three host/client seam generations
- Node.js `^22.19.0 || >=24`
- pnpm `10.x`
- The task-board plugin (`dsh-task-board`) enabled only if you want task notifications; conversation notifications do not require it

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

Refresh the Web GUI — the "Email Notify" page appears as a first-level entry in the settings sidebar.

### Uninstall

```sh
dsh plugin --profile web remove dsh-email-notify
```

## 🚀 Quick start (QQ Mail)

1. Open QQ Mail → **Settings → Account**.
2. Enable **SMTP service** (POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV section).
3. Generate an **authorization code** after the SMS verification — it is *not* your QQ password.
4. In the Web GUI "Settings → Email Notify" page, fill in:

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

## 💬 Conversation completion notifications

After SMTP is configured, a "Email Notify" checkbox appears on the left side of every conversation input:

- Checking it affects only the **current session**.
- That session sends one completion email after each finished turn (`turn/end`).
- Unchecking it stops further emails for that session.
- Checkbox state is persisted in `~/.dsh/email-notify/notify-sessions.json` and survives Host restarts.

> Conversation completion emails default to the subject `[DSH 对话完成] {{sessionId}}` and the body `DSH 会话 {{sessionId}} 已于 {{time}} 完成一轮对话。`; both are editable under Conversation subject template / Conversation body template.

## ⏳ Approval email reminder

Enable **"Approval email reminder"** in Settings → Email Notify (off by default) to receive an email while DSH is waiting for a user approval. The mail includes the approval prompt, tool name, call id, session and time.

Two modes can be selected independently:

- **Workspace approval reminder** — sandbox / workspace permission escalation requests.
- **Auto review escalation reminder** — the official `dsh-experimental-auto-review` plugin denies a call and hands it to the user.

> The Auto review escalation reminder option is only offered while the official auto review plugin is installed and live; when it is absent or disabled, only the Workspace approval reminder is available.

Approval emails default to the subject `[DSH 审批提醒] {{toolName}} 等待审批`, prefer the localized UI prompt (`displayReason`), and also include the audited reason; both the subject and body are editable under Approval subject template / Approval body template.

## ⚙️ Settings

| Setting | Default | Description |
| --- | --- | --- |
| Enable plugin | `true` | Stop polling and sending when off |
| Announce to Agent | `true` | Inject plugin guidance into the system prompt |
| Watch task board | `true` | Send mail when an execution settles |
| Poll interval (ms) | `5000` | Task-board polling frequency; minimum 1000 |
| Approval email reminder | `false` | Email while a request waits for user approval; off by default |
| Workspace approval reminder | `true` | Send reminders for workspace/sandbox approvals when the feature is on |
| Auto review escalation reminder | `true` | Send reminders for auto-review escalations; unavailable when the plugin is absent |
| SMTP host | `smtp.qq.com` | Any SMTP service |
| SMTP port | `465` | SSL for QQ Mail; STARTTLS commonly 587 |
| Use SSL/TLS | `true` | On for 465; off for 587 + STARTTLS |
| Sender email | empty | SMTP login account |
| Authorization code | empty | **Not your password**; no mail is sent while empty |
| From address | empty | e.g. `Name <email>` |
| Recipients | empty | comma / semicolon / newline separated |
| Task subject template | `[DSH 任务完成] {{taskTitle}} - {{resultText}}` | Task-board notification subject |
| Task body template | see default | Task-board notification body |
| Conversation subject template | `[DSH 对话完成] {{sessionId}}` | Conversation completion subject |
| Conversation body template | `DSH 会话 {{sessionId}} 已于 {{time}} 完成一轮对话。` | Conversation completion body |
| Approval subject template | `[DSH 审批提醒] {{toolName}} 等待审批` | Approval reminder subject |
| Approval body template | see default | Approval reminder body |

## 🧩 Template variables

Task, conversation and approval notifications each have their own subject and body templates; unknown variables expand to an empty string.

**Task notification variables**

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

**Conversation notification variables**

| Variable | Description |
| --- | --- |
| `{{sessionId}}` / `{{session}}` | Session ID |
| `{{time}}` | Completion time |

**Approval notification variables**

| Variable | Description |
| --- | --- |
| `{{modeText}}` | Localized mode name, e.g. `工作区审批提醒` |
| `{{mode}}` | Mode id: `workspace` / `auto-review` |
| `{{toolName}}` | Tool name |
| `{{callId}}` | Call id (may be empty) |
| `{{sessionId}}` / `{{session}}` | Session ID |
| `{{time}}` | Approval request time |
| `{{prompt}}` | Approval prompt |
| `{{reason}}` | Audited approval reason |

## 🔧 How it works

1. The Host-side `EmailNotifier` polls `/api/task-board/state` every `pollIntervalMs`.
2. The first successful snapshot is a **baseline**: settled executions are recorded but not emailed.
3. Later polls diff against the seen set and email newly settled executions through `nodemailer`.
4. Seen execution IDs are persisted to `~/.dsh/email-notify/seen.json` — no duplicates after restart.
5. The Host also listens to each session's `session/event`; on `turn/end` it emails the session when that session has the conversation-notify checkbox enabled.
6. The Host observes the `approval/request` waterfall (delegating with `next()`): when the approval reminder is on and the matching mode is selected, it emails the approval prompt.
7. The first-level settings page reads/writes config through the plugin's own loopback settings bridge and calls the test-mail endpoint; the input checkbox uses the `conversation-notify/describe` and `conversation-notify/set` endpoints; approval-mode availability uses `approval/availability`.

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

**Conversation checkbox is on but no email after a turn?**

- Make sure SMTP is fully configured and "Send test email" works.
- The checkbox is per-session: enable it again in each conversation where you want notifications.
- Check Host logs for `[dsh-email-notify] conversation completion send failed` or `send failed`.
- To clear all per-session checkbox state, delete `~/.dsh/email-notify/notify-sessions.json` and restart the Host.

**Approval reminder email not arriving?**

- Make sure "Approval email reminder" is on (off by default) and the intended mode (Workspace approval reminder / Auto review escalation reminder) is selected.
- The Auto review escalation reminder is only selectable while the official auto review plugin is installed and live.
- The request must actually be waiting for a user decision; the reminder never changes the approval outcome.
- Check Host logs for `[dsh-email-notify] approval notify failed`.

## 📄 License

[Apache-2.0](./LICENSE)
