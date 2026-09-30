import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  DEFAULT_APPROVAL_BODY,
  DEFAULT_APPROVAL_SUBJECT,
  DEFAULT_CONVERSATION_BODY,
  DEFAULT_CONVERSATION_SUBJECT,
  type ApprovalRequestLike,
  type EmailNotifyConfig,
} from './index.ts'
import { sendMail } from './mailer.ts'

const TASK_BOARD_STATE_PATH = '/api/task-board/state'

interface StateFile {
  version: 1
  baselineDone: boolean
  seen: string[]
}

interface ExecutionLike {
  id?: unknown
  endedAt?: unknown
  result?: unknown
  error?: unknown
  startedAt?: unknown
}

interface TaskLike {
  id?: unknown
  title?: unknown
  executions?: ExecutionLike[]
}

interface TaskBoardStateLike {
  tasks?: TaskLike[]
}

interface NotifierDeps {
  getConfig: () => EmailNotifyConfig
  origin: () => string
  now?: () => number
  fetchImpl?: typeof fetch
  statePath?: string
}

/** Last observed approval attempt, exposed through the diagnostics route. */
interface ApprovalSummary {
  at: number
  source: string
  mode: string
  toolName: string
  sessionId: string
  callId: string
  sent: boolean
  error?: string
}

function stateKey(taskId: unknown, executionId: unknown): string {
  return `${String(taskId)}::${String(executionId)}`
}

/**
 * DSH >= 0.2 exposes a `.volatile()` Config field as a frozen reference whose
 * live value is read through `get()`; older seams pass plain values. Unwrap
 * those references before rendering templates or parsing ports.
 */
type VolatileLike = { get: () => unknown }

function isVolatileLike(value: unknown): value is VolatileLike {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  if (typeof (value as { get?: unknown }).get !== 'function') return false
  // createVolatile() freezes { get, [symbol]: setter }: the symbol is the
  // cross-copy marker, while the string keys are only ever ['get'].
  return Object.getOwnPropertySymbols(value).length > 0
    || Object.keys(value as object).every(key => key === 'get')
}

function readField<T>(value: unknown): T | undefined {
  if (isVolatileLike(value)) return value.get() as T | undefined
  return value as T | undefined
}

/** Flatten one plugin Config snapshot so every field is a plain JS value. */
export function resolveConfig(config: EmailNotifyConfig | undefined): EmailNotifyConfig {
  const source = (isVolatileLike(config) ? config.get() : config ?? {}) as Record<string, unknown>
  return {
    enabled: readField<boolean>(source.enabled),
    announceToAgent: readField<boolean>(source.announceToAgent),
    watchTaskBoard: readField<boolean>(source.watchTaskBoard),
    pollIntervalMs: readField<number>(source.pollIntervalMs),
    approvalNotifyEnabled: readField<boolean>(source.approvalNotifyEnabled),
    approvalNotifyWorkspace: readField<boolean>(source.approvalNotifyWorkspace),
    approvalNotifyAutoReview: readField<boolean>(source.approvalNotifyAutoReview),
    smtpHost: readField<string>(source.smtpHost),
    smtpPort: readField<number>(source.smtpPort),
    smtpSecure: readField<boolean>(source.smtpSecure),
    smtpUser: readField<string>(source.smtpUser),
    smtpPassword: readField<string>(source.smtpPassword),
    mailFrom: readField<string>(source.mailFrom),
    mailTo: readField<string>(source.mailTo),
    subjectTemplate: readField<string>(source.subjectTemplate),
    bodyTemplate: readField<string>(source.bodyTemplate),
    conversationSubjectTemplate: readField<string>(source.conversationSubjectTemplate),
    conversationBodyTemplate: readField<string>(source.conversationBodyTemplate),
    approvalSubjectTemplate: readField<string>(source.approvalSubjectTemplate),
    approvalBodyTemplate: readField<string>(source.approvalBodyTemplate),
  }
}

function renderTemplate(template: unknown, vars: Record<string, string>): string {
  const source = typeof template === 'string' ? template : ''
  return source.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
}

/**
 * Drop label-only lines left by empty optional template variables (call id,
 * session, audited reason) and collapse the blank line that follows. Section
 * headings such as `审批提示：` are kept because their content follows.
 */
const OPTIONAL_LABEL_LINE = /^(调用 ID|会话|原始原因|Call ID|Session|Audited reason|Reason)[：:]\s*$/u

function cleanRenderedBody(value: string): string {
  const lines = value.split('\n')
  const kept: string[] = []
  let droppedLabel = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (droppedLabel && trimmed === '') {
      droppedLabel = false
      continue
    }
    droppedLabel = false
    if (OPTIONAL_LABEL_LINE.test(trimmed)) {
      droppedLabel = true
      continue
    }
    kept.push(line)
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/** Render a plain-text body as a minimal HTML email body. */
function textToHtml(value: string): string {
  return '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:14px;line-height:1.7;color:#24292f;white-space:pre-wrap">'
    + escapeHtml(value)
    + '</div>'
}

/** Whether a waterfall request came from the official experimental Auto review plugin. */
function isAutoReviewApproval(request: ApprovalRequestLike): boolean {
  const reason = typeof request.reason === 'string' ? request.reason : ''
  if (reason.includes('Auto review')) return true
  return displayReasonText(request.displayReason).includes('Auto review')
}

/** Read localized display text, accepting either a plain string or an { en, zh } record. */
function displayReasonText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['zh', 'en']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate !== '') return candidate
    }
    for (const candidate of Object.values(record)) {
      if (typeof candidate === 'string' && candidate !== '') return candidate
    }
  }
  return ''
}

/** The human-facing approval prompt: localized display text first, audited reason second. */
function approvalPromptText(request: ApprovalRequestLike): string {
  const display = displayReasonText(request.displayReason)
  if (display !== '') return display
  if (typeof request.reason === 'string' && request.reason !== '') return request.reason
  return '需要用户审批'
}

function formatTime(value: number | undefined): string {
  return value === undefined ? '' : new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function resultText(result: unknown): string {
  switch (result) {
    case 'succeeded': return '成功'
    case 'failed': return '失败'
    case 'cancelled': return '已取消'
    default: return result === undefined ? '未知' : String(result)
  }
}

/**
 * Polls the task-board Host API and sends one email per newly settled
 * execution. Seen execution ids are persisted under $DSH_HOME/email-notify,
 * so a Host restart does not re-send historical completions.
 */
export class EmailNotifier {
  private timer: ReturnType<typeof setInterval> | undefined
  private pollInFlight = false
  private baselineDone = false
  private readonly seen = new Set<string>()
  private readonly notifySessions = new Set<string>()
  private readonly approvalSeen = new WeakSet<object>()
  private readonly approvalKeys = new Set<string>()
  private approvalObserved = 0
  private approvalSent = 0
  private lastApproval: ApprovalSummary | undefined
  private config: EmailNotifyConfig = {}
  private readonly now: () => number
  private readonly fetchImpl: typeof fetch
  private readonly statePath: string
  private readonly notifyStatePath: string

  constructor(private readonly deps: NotifierDeps) {
    this.now = deps.now ?? Date.now
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.statePath = deps.statePath ?? defaultStatePath()
    this.notifyStatePath = join(dirname(this.statePath), 'notify-sessions.json')
    this.loadState()
    this.loadNotifyState()
  }

  applyConfig(config: EmailNotifyConfig): void {
    const plain = resolveConfig(config)
    this.config = plain
    if ((plain.enabled ?? true) && (plain.watchTaskBoard ?? true)) {
      this.start()
    } else {
      this.stop()
    }
  }

  start(): void {
    if (this.timer !== undefined) return
    this.timer = setInterval(() => { void this.poll() }, this.config.pollIntervalMs ?? 5000)
    void this.poll()
  }

  stop(): void {
    if (this.timer === undefined) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  dispose(): void {
    this.stop()
  }

  async sendTestEmail(): Promise<void> {
    const config = this.config
    const vars = this.testVars()
    const body = renderTemplate(config.bodyTemplate, vars)
    await sendMail(config, {
      subject: renderTemplate(config.subjectTemplate, vars),
      text: body,
      html: textToHtml(body),
    })
  }

  isConversationNotify(sessionId: string): boolean {
    return this.notifySessions.has(sessionId)
  }

  async setConversationNotify(sessionId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      this.notifySessions.add(sessionId)
    } else {
      this.notifySessions.delete(sessionId)
    }
    this.persistNotifyState()
  }

  async sendConversationCompletionEmail(sessionId: string): Promise<void> {
    if (!(this.config.enabled ?? true)) return
    const vars = {
      sessionId,
      session: sessionId,
      time: formatTime(this.now()),
    }
    const body = renderTemplate(this.config.conversationBodyTemplate ?? DEFAULT_CONVERSATION_BODY, vars)
    await sendMail(this.config, {
      subject: renderTemplate(this.config.conversationSubjectTemplate ?? DEFAULT_CONVERSATION_SUBJECT, vars),
      text: body,
      html: textToHtml(body),
    })
  }

  /**
   * Send one reminder for a pending approval request. The feature is opt-in
   * (default off) and each mode can be enabled independently; a missing mode
   * choice never sends. Requests are deduplicated by identity so a replayed
   * waterfall does not queue the same mail twice.
   */
  async notifyApprovalRequest(request: ApprovalRequestLike): Promise<void> {
    if (typeof request !== 'object' || request === null) return
    if (this.approvalSeen.has(request)) return
    this.approvalSeen.add(request)

    const autoReview = isAutoReviewApproval(request)
    if (!this.shouldSendApproval(autoReview)) return

    const sessionId = String(request.agent?.session?.id ?? '')
    const toolName = typeof request.toolName === 'string' && request.toolName !== '' ? request.toolName : '未知工具'
    const callId = typeof request.callId === 'string' && request.callId !== '' ? request.callId : ''
    const prompt = approvalPromptText(request)
    const reason = typeof request.reason === 'string' ? request.reason : ''
    const key = this.approvalKey(sessionId, toolName, callId)

    this.approvalObserved += 1
    if (this.approvalKeys.has(key)) return
    this.approvalKeys.add(key)

    const summary: ApprovalSummary = {
      at: this.now(),
      source: 'waterfall',
      mode: autoReview ? 'auto-review' : 'workspace',
      toolName,
      sessionId,
      callId,
      sent: false,
    }
    this.lastApproval = summary
    try {
      await this.sendApprovalEmail({
        autoReview,
        sessionId,
        toolName,
        callId,
        prompt,
        reason: reason === prompt ? '' : reason,
      })
      summary.sent = true
      this.approvalSent += 1
    } catch (error) {
      this.approvalKeys.delete(key)
      summary.sent = false
      summary.error = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  /**
   * Fallback path for approvals observed through the durable `approval/asked`
   * session event. It carries the audited reason but no localized display
   * reason; the waterfall path normally wins the dedupe key first.
   */
  async notifyApprovalAsked(sessionId: string, data: unknown): Promise<void> {
    if (typeof data !== 'object' || data === null) return
    const record = data as { toolName?: unknown; callId?: unknown; reason?: unknown }
    const toolName = typeof record.toolName === 'string' && record.toolName !== '' ? record.toolName : '未知工具'
    const callId = typeof record.callId === 'string' ? record.callId : ''
    const reason = typeof record.reason === 'string' ? record.reason : ''
    const autoReview = reason.includes('Auto review')
    if (!this.shouldSendApproval(autoReview)) return

    const key = this.approvalKey(sessionId, toolName, callId)
    this.approvalObserved += 1
    if (this.approvalKeys.has(key)) return
    this.approvalKeys.add(key)

    const summary: ApprovalSummary = {
      at: this.now(),
      source: 'asked',
      mode: autoReview ? 'auto-review' : 'workspace',
      toolName,
      sessionId,
      callId,
      sent: false,
    }
    this.lastApproval = summary
    try {
      await this.sendApprovalEmail({
        autoReview,
        sessionId,
        toolName,
        callId,
        prompt: reason === '' ? '需要用户审批' : reason,
        reason: '',
      })
      summary.sent = true
      this.approvalSent += 1
    } catch (error) {
      this.approvalKeys.delete(key)
      summary.sent = false
      summary.error = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  /** Diagnostics for the settings card / manual debugging. */
  getApprovalStatus(): Record<string, unknown> {
    const config = this.config
    return {
      enabled: config.enabled ?? true,
      approvalNotifyEnabled: config.approvalNotifyEnabled ?? false,
      approvalNotifyWorkspace: config.approvalNotifyWorkspace ?? true,
      approvalNotifyAutoReview: config.approvalNotifyAutoReview ?? true,
      approvalObserved: this.approvalObserved,
      approvalSent: this.approvalSent,
      lastApproval: this.lastApproval ?? null,
    }
  }

  private shouldSendApproval(autoReview: boolean): boolean {
    const config = this.config
    if (!(config.enabled ?? true)) return false
    if (!(config.approvalNotifyEnabled ?? false)) return false
    return autoReview ? (config.approvalNotifyAutoReview ?? true) : (config.approvalNotifyWorkspace ?? true)
  }

  private approvalKey(sessionId: string, toolName: string, callId: string): string {
    return `${sessionId}|${toolName}|${callId}|${Math.floor(this.now() / 60_000)}`
  }

  private async sendApprovalEmail(input: {
    autoReview: boolean
    sessionId: string
    toolName: string
    callId: string
    prompt: string
    reason: string
  }): Promise<void> {
    const config = this.config
    const modeText = input.autoReview ? 'Auto review 转手动审批提醒' : '工作区审批提醒'
    const vars: Record<string, string> = {
      mode: input.autoReview ? 'auto-review' : 'workspace',
      modeText,
      toolName: input.toolName,
      callId: input.callId,
      sessionId: input.sessionId,
      session: input.sessionId,
      time: formatTime(this.now()),
      prompt: input.prompt,
      reason: input.reason,
    }
    const subject = renderTemplate(config.approvalSubjectTemplate ?? DEFAULT_APPROVAL_SUBJECT, vars)
    const body = cleanRenderedBody(renderTemplate(config.approvalBodyTemplate ?? DEFAULT_APPROVAL_BODY, vars))
    await sendMail(config, {
      subject,
      text: body,
      html: textToHtml(body),
    })
  }

  private testVars(): Record<string, string> {
    return {
      taskTitle: '测试任务',
      result: 'succeeded',
      resultText: '成功',
      taskId: 'test-task',
      executionId: 'test-execution',
      startedAt: formatTime(this.now()),
      endedAt: formatTime(this.now()),
      durationText: '0 秒',
      error: '',
    }
  }

  private async poll(): Promise<void> {
    if (this.pollInFlight) return
    this.pollInFlight = true
    try {
      const active = this.config
      if (!(active.enabled ?? true) || !(active.watchTaskBoard ?? true)) return
      const state = await this.fetchTaskBoardState()
      if (state === undefined) return
      const newlySeen = this.reconcile(state.tasks ?? [])
      if (newlySeen.length > 0) this.persist()
    } catch (error) {
      console.error('[dsh-email-notify] poll failed:', error instanceof Error ? error.message : error)
    } finally {
      this.pollInFlight = false
    }
  }

  private async fetchTaskBoardState(): Promise<TaskBoardStateLike | undefined> {
    const origin = this.deps.origin()
    try {
      const response = await this.fetchImpl(`${origin}${TASK_BOARD_STATE_PATH}`, {
        headers: { origin, accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) return undefined
      return await response.json() as TaskBoardStateLike
    } catch {
      return undefined
    }
  }

  /**
   * Diff the current ledger against the persisted seen set. The first
   * successful snapshot is a baseline: existing ended executions are recorded
   * silently, and only later settlements produce mail.
   */
  private reconcile(tasks: TaskLike[]): string[] {
    const newlySeen: string[] = []
    for (const task of tasks) {
      for (const execution of task.executions ?? []) {
        if (typeof execution.endedAt !== 'number') continue
        const key = stateKey(task.id, execution.id)
        if (this.baselineDone) {
          if (!this.seen.has(key)) {
            this.seen.add(key)
            newlySeen.push(key)
            void this.notify(task, execution)
          }
        } else {
          this.seen.add(key)
          newlySeen.push(key)
        }
      }
    }
    if (!this.baselineDone) {
      this.baselineDone = true
    }
    return newlySeen
  }

  private async notify(task: TaskLike, execution: ExecutionLike): Promise<void> {
    const startedAt = typeof execution.startedAt === 'number' ? execution.startedAt : undefined
    const endedAt = typeof execution.endedAt === 'number' ? execution.endedAt : undefined
    const durationMs = startedAt !== undefined && endedAt !== undefined ? endedAt - startedAt : undefined
    const durationText = durationMs === undefined ? '' : formatDuration(durationMs)
    const vars: Record<string, string> = {
      taskTitle: String(task.title ?? '未命名任务'),
      result: String(execution.result ?? ''),
      resultText: resultText(execution.result),
      taskId: String(task.id ?? ''),
      executionId: String(execution.id ?? ''),
      startedAt: formatTime(startedAt),
      endedAt: formatTime(endedAt),
      durationText,
      error: execution.error === undefined ? '' : String(execution.error),
    }
    try {
      await sendMail(this.config, {
        subject: renderTemplate(this.config.subjectTemplate, vars),
        text: renderTemplate(this.config.bodyTemplate, vars),
        html: `<pre>${escapeHtml(renderTemplate(this.config.bodyTemplate, vars))}</pre>`,
      })
    } catch (error) {
      console.error('[dsh-email-notify] send failed:', error instanceof Error ? error.message : error)
    }
  }

  private loadState(): void {
    try {
      if (!existsSync(this.statePath)) return
      const parsed = JSON.parse(readFileSync(this.statePath, 'utf8')) as Partial<StateFile>
      if (parsed.version === 1) {
        this.baselineDone = parsed.baselineDone === true
        for (const key of parsed.seen ?? []) {
          if (typeof key === 'string') this.seen.add(key)
        }
      }
    } catch (error) {
      console.error('[dsh-email-notify] state load failed:', error instanceof Error ? error.message : error)
    }
  }

  private loadNotifyState(): void {
    try {
      if (!existsSync(this.notifyStatePath)) return
      const parsed = JSON.parse(readFileSync(this.notifyStatePath, 'utf8')) as { sessions?: unknown }
      if (Array.isArray(parsed.sessions)) {
        for (const key of parsed.sessions) {
          if (typeof key === 'string') this.notifySessions.add(key)
        }
      }
    } catch (error) {
      console.error('[dsh-email-notify] notify state load failed:', error instanceof Error ? error.message : error)
    }
  }

  private persistNotifyState(): void {
    try {
      mkdirSync(dirname(this.notifyStatePath), { recursive: true })
      writeFileSync(this.notifyStatePath, JSON.stringify({
        version: 1,
        sessions: [...this.notifySessions].sort(),
      }, null, 2), 'utf8')
    } catch (error) {
      console.error('[dsh-email-notify] notify state persist failed:', error instanceof Error ? error.message : error)
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.statePath), { recursive: true })
      const state: StateFile = {
        version: 1,
        baselineDone: this.baselineDone,
        seen: [...this.seen].sort(),
      }
      writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf8')
    } catch (error) {
      console.error('[dsh-email-notify] state persist failed:', error instanceof Error ? error.message : error)
    }
  }
}

function defaultStatePath(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'email-notify', 'seen.json')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} 小时`)
  if (minutes > 0) parts.push(`${minutes} 分钟`)
  parts.push(`${seconds} 秒`)
  return parts.join(' ')
}
