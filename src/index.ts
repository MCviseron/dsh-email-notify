import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import { EmailNotifier } from './notifier.ts'
import { makeEmailNotifyRoutes, makeEmailNotifySettingsRoutes } from './routes.ts'

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 210

export const EMAIL_NOTIFY_SETTINGS_NAMESPACE = settingsNamespace('email-notify')

export interface EmailNotifyConfig {
  enabled?: boolean
  announceToAgent?: boolean
  watchTaskBoard?: boolean
  pollIntervalMs?: number
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpUser?: string
  smtpPassword?: string
  mailFrom?: string
  mailTo?: string
  subjectTemplate?: string
  bodyTemplate?: string
}

export const Config: z<EmailNotifyConfig> = z.object({
  enabled: z.boolean().default(true),
  announceToAgent: z.boolean().default(true),
  watchTaskBoard: z.boolean().default(true),
  pollIntervalMs: z.number().min(1000).default(5000),
  smtpHost: z.string().default('smtp.qq.com'),
  smtpPort: z.number().min(1).max(65535).default(465),
  smtpSecure: z.boolean().default(true),
  smtpUser: z.string().default(''),
  smtpPassword: z.string().role('secret').default(''),
  mailFrom: z.string().default(''),
  mailTo: z.string().default(''),
  subjectTemplate: z.string().default('[DSH 任务完成] {{taskTitle}} - {{resultText}}'),
  bodyTemplate: z.string().default('DSH 任务「{{taskTitle}}」已完成\n\n结果：{{resultText}}\n任务 ID：{{taskId}}\n执行 ID：{{executionId}}\n开始时间：{{startedAt}}\n结束时间：{{endedAt}}\n耗时：{{durationText}}\n错误：{{error}}'),
})

export const EMAIL_NOTIFY_GUIDANCE = '本机已安装 dsh-email-notify 插件（DSH 任务完成邮件通知）：默认监听任务看板的执行结算，任务成功、失败或取消后会通过 SMTP（默认 QQ 邮箱）发送邮件。配置位于 Web GUI 设置页的「邮件通知」卡片：SMTP 服务器/端口/安全连接、发件邮箱、QQ 邮箱授权码（不是登录密码）、收件人、主题与正文模板；可发送测试邮件。授权码留空时插件不发送任何邮件。用户提到「邮件通知 / 任务完成发邮件 / QQ 邮箱授权码 / 测试邮件」时即指本插件，请据此协作。'

export const inject = ['webServer', 'systemPrompt']

export function apply(ctx: Context, config?: EmailNotifyConfig): void {
  const notifier = new EmailNotifier({
    getConfig: () => current(),
    origin: () => `http://127.0.0.1:${ctx.webServer.port}`,
  })

  ctx.effect(() => {
    const disposers = makeEmailNotifyRoutes(notifier).map(route => ctx.webServer.register(route))
    return () => { for (const dispose of disposers) dispose() }
  }, 'email-notify: test-mail route')

  // The rc.6 host-apiproxy allowlist does not expose third-party settings
  // namespaces, so this plugin serves its own loopback settings bridge to the
  // Web GUI card. It rides ctx.settings for validation/persistence.
  ctx.inject(['settings'], (sctx) => {
    sctx.effect(() => {
      const disposers = makeEmailNotifySettingsRoutes(sctx.settings).map(route => ctx.webServer.register(route))
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
    const active = current()
    notifier.applyConfig(active)
    if ((active.enabled ?? true) && (active.announceToAgent ?? true)) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:email-notify',
        order: SECTION_ORDER,
        text: EMAIL_NOTIFY_GUIDANCE,
      })
    }
  }

  installSettingsSection(ctx, EMAIL_NOTIFY_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => { current = source },
    onChange: sync,
  })

  sync()
}
