import nodemailer from 'nodemailer'
import type { EmailNotifyConfig } from './index.ts'

export interface MailMessage {
  subject: string
  text: string
  html?: string
}

/** Split a recipient field on commas (ASCII or full-width), semicolons, and newlines. */
export function parseRecipients(value: string): string[] {
  return value
    .split(/[,;，；\n]/)
    .map(item => item.trim())
    .filter(item => item.length > 0)
}

/** Validate that every field required to actually send mail is present. */
export function assertSendable(config: EmailNotifyConfig): asserts config is EmailNotifyConfig & Required<Pick<EmailNotifyConfig, 'smtpHost' | 'smtpUser' | 'smtpPassword' | 'mailFrom' | 'mailTo'>> {
  const missing: string[] = []
  if (!config.smtpHost?.trim()) missing.push('SMTP 服务器')
  if (!config.smtpUser?.trim()) missing.push('发件邮箱')
  if (!config.smtpPassword?.trim()) missing.push('邮箱授权码')
  if (!config.mailFrom?.trim()) missing.push('发件人地址')
  if (!config.mailTo?.trim()) missing.push('收件人')
  if (missing.length > 0) throw new Error('邮件通知配置不完整：缺少 ' + missing.join('、'))
}

export async function sendMail(config: EmailNotifyConfig, message: MailMessage): Promise<void> {
  assertSendable(config)
  const recipients = parseRecipients(config.mailTo)
  if (recipients.length === 0) throw new Error('邮件通知配置不完整：收件人为空')
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort ?? 465,
    secure: config.smtpSecure ?? true,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPassword,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
  try {
    await transporter.sendMail({
      from: config.mailFrom,
      to: recipients.join(', '),
      subject: message.subject,
      text: message.text,
      ...(message.html === undefined ? {} : { html: message.html }),
    })
  } finally {
    transporter.close()
  }
}
