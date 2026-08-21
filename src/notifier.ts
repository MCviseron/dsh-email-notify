import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { EmailNotifyConfig } from './index.ts'
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

function stateKey(taskId: unknown, executionId: unknown): string {
  return `${String(taskId)}::${String(executionId)}`
}

function renderTemplate(template: string | undefined, vars: Record<string, string>): string {
  const source = template ?? ''
  return source.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
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
  private config: EmailNotifyConfig = {}
  private readonly now: () => number
  private readonly fetchImpl: typeof fetch
  private readonly statePath: string

  constructor(private readonly deps: NotifierDeps) {
    this.now = deps.now ?? Date.now
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.statePath = deps.statePath ?? defaultStatePath()
    this.loadState()
  }

  applyConfig(config: EmailNotifyConfig): void {
    this.config = config
    if (config.enabled ?? true) {
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
    const now = this.now()
    await sendMail(config, {
      subject: renderTemplate(config.subjectTemplate, this.testVars()),
      text: renderTemplate(config.bodyTemplate, this.testVars()),
      html: `<pre>${escapeHtml(renderTemplate(config.bodyTemplate, this.testVars()))}</pre>`,
    })
    void now
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
