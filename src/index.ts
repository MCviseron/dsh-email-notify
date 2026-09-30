import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** Minimal structural view of the approval/request waterfall payload. */
export interface ApprovalRequestLike {
  agent?: { session?: { id?: unknown } }
  toolName?: unknown
  callId?: unknown
  reason?: unknown
  displayReason?: unknown
  signal?: unknown
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Minimal declaration of the session event feed this plugin listens to.
     * The runtime event surface is owned by @deepseek-ai/dsh-session; this
     * structural merge keeps the plugin compilable across DSH generations.
     */
    'session/event'(session: { id?: unknown }, event: { type: string; data?: unknown }): void

    /**
     * Minimal declaration of the approval waterfall. Answerers return an
     * outcome or delegate with `next()`; this plugin only observes (and
     * delegates) so it never changes the approval decision.
     */
    'approval/request'(request: ApprovalRequestLike, next: () => unknown): unknown
  }
}
import { EmailNotifier, resolveConfig } from './notifier.ts'
import { makeEmailNotifyRoutes, makeEmailNotifySettingsRoutes, type SettingsBridge } from './routes.ts'

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 210

/** Settings namespace owned by this plugin (a lowercase hyphenated id since DSH 0.1.5). */
export const EMAIL_NOTIFY_SETTINGS_NAMESPACE = 'email-notify'

export interface EmailNotifyConfig {
  enabled?: boolean
  announceToAgent?: boolean
  watchTaskBoard?: boolean
  pollIntervalMs?: number
  approvalNotifyEnabled?: boolean
  approvalNotifyWorkspace?: boolean
  approvalNotifyAutoReview?: boolean
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpUser?: string
  smtpPassword?: string
  mailFrom?: string
  mailTo?: string
  subjectTemplate?: string
  bodyTemplate?: string
  conversationSubjectTemplate?: string
  conversationBodyTemplate?: string
  approvalSubjectTemplate?: string
  approvalBodyTemplate?: string
}

/** Default subject for conversation-completion notifications. */
export const DEFAULT_CONVERSATION_SUBJECT = '[DSH 对话完成] {{sessionId}}'
/** Default body for conversation-completion notifications. */
export const DEFAULT_CONVERSATION_BODY = 'DSH 会话 {{sessionId}} 已于 {{time}} 完成一轮对话。'
/** Default subject for approval reminders. */
export const DEFAULT_APPROVAL_SUBJECT = '[DSH 审批提醒] {{toolName}} 等待审批'
/** Default body for approval reminders. */
export const DEFAULT_APPROVAL_BODY = [
  'DSH 有一条操作正在等待你的审批。',
  '',
  '审批类型：{{modeText}}',
  '工具：{{toolName}}',
  '调用 ID：{{callId}}',
  '会话：{{sessionId}}',
  '时间：{{time}}',
  '',
  '审批提示：',
  '{{prompt}}',
  '',
  '原始原因：',
  '{{reason}}',
].join('\n')

/**
 * Schema of this plugin's profile entry Config — which IS its settings namespace
 * on DSH >= 0.2, where only fields marked `volatile` become live-editable form
 * fields (every field here is applied without a restart). The marker is inert
 * metadata on the older settings seams.
 */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  announceToAgent: z.boolean().default(true).volatile(),
  watchTaskBoard: z.boolean().default(true).volatile(),
  pollIntervalMs: z.number().min(1000).default(5000).volatile(),
  approvalNotifyEnabled: z.boolean().default(false).volatile(),
  approvalNotifyWorkspace: z.boolean().default(true).volatile(),
  approvalNotifyAutoReview: z.boolean().default(true).volatile(),
  smtpHost: z.string().default('smtp.qq.com').volatile(),
  smtpPort: z.number().min(1).max(65535).default(465).volatile(),
  smtpSecure: z.boolean().default(true).volatile(),
  smtpUser: z.string().default('').volatile(),
  smtpPassword: z.string().role('secret').default('').volatile(),
  mailFrom: z.string().default('').volatile(),
  mailTo: z.string().default('').volatile(),
  subjectTemplate: z.string().default('[DSH 任务完成] {{taskTitle}} - {{resultText}}').volatile(),
  bodyTemplate: z.string().default('DSH 任务「{{taskTitle}}」已完成\n\n结果：{{resultText}}\n任务 ID：{{taskId}}\n执行 ID：{{executionId}}\n开始时间：{{startedAt}}\n结束时间：{{endedAt}}\n耗时：{{durationText}}\n错误：{{error}}').volatile(),
  conversationSubjectTemplate: z.string().default(DEFAULT_CONVERSATION_SUBJECT).volatile(),
  conversationBodyTemplate: z.string().default(DEFAULT_CONVERSATION_BODY).volatile(),
  approvalSubjectTemplate: z.string().default(DEFAULT_APPROVAL_SUBJECT).volatile(),
  approvalBodyTemplate: z.string().default(DEFAULT_APPROVAL_BODY).volatile(),
})

export const EMAIL_NOTIFY_GUIDANCE = '本机已安装 dsh-email-notify 插件（DSH 邮件通知）：默认监听任务看板的执行结算，任务成功、失败或取消后会通过 SMTP（默认 QQ 邮箱）发送邮件；也可以在对话输入框左侧勾选「邮件通知」，勾选后当前会话每完成一轮都会发送完成邮件；还可在设置中开启「审批邮件提醒」，等待用户审批时发送提醒邮件（可选工作区审批、官方 auto review 转手动审批两种模式，默认关闭）。配置位于 Web GUI 设置侧边栏的「邮件通知」一级设置页：SMTP 服务器/端口/安全连接、发件邮箱、QQ 邮箱授权码（不是登录密码）、收件人、主题与正文模板；可发送测试邮件。授权码留空时插件不发送任何邮件。用户提到「邮件通知 / 任务完成发邮件 / 对话完成通知 / 审批邮件提醒 / QQ 邮箱授权码 / 测试邮件」时即指本插件，请据此协作。'

/** Hooks a settings registration hands to the DSH settings seam. */
interface SettingsSectionHooks<T> {
  setSource: (source: () => T) => void
  onChange: () => void
}

/** Owner handle of one registered namespace, as both settings generations expose it. */
interface SettingsScopeHandle<T> {
  get: () => T
  watch: (callback: () => void) => () => void
}

/**
 * The provider faces this registration probes at runtime, newest first:
 *
 * - `configure` (DSH >= 0.2 `SettingsForms`): a plugin's settings namespace IS its
 *   profile entry Config, so there is no namespace to register — only the
 *   automatic-page policy is ours to set.
 * - `installSection` (DSH >= 0.1.5): the old free `installSettingsSection` moved
 *   onto the provider.
 * - `register` (<= 0.1.1): what that free function used internally.
 */
interface SettingsProviderFaces<T> {
  configure?: (presentation: { auto?: boolean }) => () => void
  installSection?: (owner: Context, ns: string, schema: unknown, entry: T, hooks: SettingsSectionHooks<T>) => void
  register?: (ns: string, schema: unknown, options: { base: T }) => SettingsScopeHandle<T>
}

/** Fiber states meaning "this plugin is tearing down" (value mirror of FiberState). */
const FIBER_DISPOSED = 4
const FIBER_UNLOADING = 5

/** Whether the owning plugin's fiber is unloading or already disposed. */
function isUnloading(ctx: Context): boolean {
  const state = (ctx as unknown as { fiber?: { state?: number } }).fiber?.state
  return state === FIBER_UNLOADING || state === FIBER_DISPOSED
}

/**
 * Register this plugin's settings namespace on whichever settings seam the
 * running DSH exposes, so one build serves every generation:
 *
 * - DSH >= 0.2: nothing to register (the entry Config is the namespace); the
 *   automatic settings page is switched off so the shipped card is the only page.
 * - the pre-0.1.5 wiring over `settings.register(ns, schema, { base })`, which is
 *   exactly what the removed free `installSettingsSection` did: point the source
 *   thunk at the resolved scope, fall back to the composition entry when the
 *   scope detaches, and re-run `onChange` on every committed change.
 *
 * @param ctx - the plugin context owning the section (its unload releases it).
 * @param scoped - the settings-service context the registration rides.
 * @param ns - this plugin's settings namespace id.
 * @param schema - schemastery schema resolving the namespace value.
 * @param entry - composition entry used as the base layer and fallback value.
 * @param hooks - source sink and change notification.
 */
function installSettingsSection<T>(ctx: Context, scoped: Context, ns: string, schema: unknown, entry: T, hooks: SettingsSectionHooks<T>): void {
  const provider = scoped.settings as unknown as SettingsProviderFaces<T>
  if (typeof provider.configure === 'function') {
    // DSH >= 0.2: the entry Config in the profile patch is this plugin's settings
    // namespace and the Loader re-applies the plugin on every committed change, so
    // the apply() argument is authoritative — nothing to register. Suppress the
    // auto-generated page because this plugin ships its own settings card.
    ctx.effect(() => provider.configure!({ auto: false }), 'dsh-email-notify: settings page policy')
    hooks.onChange()
    return
  }
  if (typeof provider.installSection === 'function') {
    provider.installSection(ctx, ns, schema, entry, hooks)
    return
  }
  if (typeof provider.register === 'function') {
    const scope = provider.register(ns, schema, { base: entry })
    hooks.setSource(() => scope.get())
    scoped.effect(() => () => {
      if (isUnloading(ctx)) return
      hooks.setSource(() => entry)
      hooks.onChange()
    })
    hooks.onChange()
    scope.watch(() => {
      if (isUnloading(ctx)) return
      hooks.onChange()
    })
    return
  }
  throw new TypeError('dsh-email-notify: the running dsh settings service exposes none of configure (>= 0.2), installSection (>= 0.1.5), register (<= 0.1.1)')
}

/** Whether the official experimental Auto review plugin is currently live. */
function isAutoReviewAvailable(ctx: Context): boolean {
  try {
    const get = (ctx as unknown as { get?: (name: string) => unknown }).get
    const service = typeof get === 'function' ? get.call(ctx, 'permissionPresets') : undefined
    const names = (service as { names?: unknown } | undefined)?.names
    return Array.isArray(names) && names.includes('auto')
  } catch {
    return false
  }
}

export const inject = ['webServer', 'systemPrompt']

export function apply(ctx: Context, config?: EmailNotifyConfig): void {
  const notifier = new EmailNotifier({
    getConfig: () => current(),
    origin: () => `http://127.0.0.1:${ctx.webServer.port}`,
  })

  ctx.effect(() => {
    const disposers = makeEmailNotifyRoutes(notifier, () => isAutoReviewAvailable(ctx)).map(route => ctx.webServer.register(route))
    return () => { for (const dispose of disposers) dispose() }
  }, 'email-notify: test-mail route')

  ctx.on('session/event', (session, event) => {
    const sessionId = String(session.id ?? '')
    if (event.type === 'turn/end') {
      if (sessionId === '' || !notifier.isConversationNotify(sessionId)) return
      void notifier.sendConversationCompletionEmail(sessionId).catch((error) => {
        console.error('[dsh-email-notify] conversation completion send failed:', error instanceof Error ? error.message : error)
      })
      return
    }
    if (event.type === 'approval/asked') {
      // Fallback for approval paths that do not reach the waterfall listener.
      // Delay it briefly so the richer approval/request path can win the
      // dedupe key and send the localized prompt first.
      const data = event.data
      setTimeout(() => {
        void notifier.notifyApprovalAsked(sessionId, data).catch((error) => {
          console.error('[dsh-email-notify] approval asked notify failed:', error instanceof Error ? error.message : error)
        })
      }, 500)
    }
  })

  ctx.on('approval/request', (request, next) => {
    // Observe, never decide: send the reminder in the background and delegate
    // the actual approval to the composed answerers.
    void notifier.notifyApprovalRequest(request).catch((error) => {
      console.error('[dsh-email-notify] approval notify failed:', error instanceof Error ? error.message : error)
    })
    return next()
  })

  // The rc.6 host-apiproxy allowlist does not expose third-party settings
  // namespaces, so this plugin serves its own loopback settings bridge to the
  // Web GUI card. It rides ctx.settings for validation/persistence.
  ctx.inject(['settings'], (sctx) => {
    sctx.effect(() => {
      const disposers = makeEmailNotifySettingsRoutes(sctx.settings as unknown as SettingsBridge).map(route => ctx.webServer.register(route))
      return () => { for (const dispose of disposers) dispose() }
    }, 'email-notify: settings bridge')
  })

  let current: () => EmailNotifyConfig = () => config ?? {}
  let disposeSection: (() => void) | undefined

  const sync = (): void => {
    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    const active = resolveConfig(current())
    notifier.applyConfig(active)
    if ((active.enabled ?? true) && (active.announceToAgent ?? true)) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:email-notify',
        order: SECTION_ORDER,
        text: EMAIL_NOTIFY_GUIDANCE,
      })
    }
  }

  ctx.inject(['settings'], (sctx) => {
    installSettingsSection(ctx, sctx, EMAIL_NOTIFY_SETTINGS_NAMESPACE, Config, config ?? {}, {
      setSource: (source) => { current = source },
      onChange: sync,
    })
  })

  sync()
}
