import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { EmailNotifyKey } from './locales.ts'
import type { SettingsScope } from './settings-scope.ts'

const API = {
  approvalAvailability: '/api/dsh-email-notify/approval/availability',
} as const

export interface EmailNotifySettings {
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

export interface EmailNotifySettingsCardState {
  status: 'loading' | 'ready' | 'unavailable'
  config?: EmailNotifySettings
  writable: boolean
}

export interface EmailNotifySettingsCardFace {
  hooks: {
    emailNotifySettingsCard: SnapshotStore<EmailNotifySettingsCardState>
  }
  save(draft: EmailNotifySettings): Promise<void>
  resetAll(): Promise<void>
  sendTest(): Promise<void>
}

export class EmailNotifySettingsCardController {
  private readonly store = createSnapshotStore<EmailNotifySettingsCardState>({ status: 'loading', writable: false })
  private readonly disposeScope: () => void

  constructor(private readonly scope: SettingsScope<EmailNotifySettings>) {
    this.disposeScope = scope.subscribe(() => { this.sync() })
    this.sync()
  }

  private sync(): void {
    const snapshot = this.scope.getSnapshot()
    this.store.set({
      status: snapshot.status,
      config: snapshot.value,
      writable: snapshot.writable,
    })
  }

  inject(): EmailNotifySettingsCardFace {
    return {
      hooks: { emailNotifySettingsCard: this.store },
      save: async (draft) => { await this.save(draft) },
      resetAll: async () => { await this.resetAll() },
      sendTest: async () => { await this.sendTest() },
    }
  }

  dispose(): void {
    this.disposeScope()
  }

  private async save(draft: EmailNotifySettings): Promise<void> {
    for (const [field, value] of Object.entries(draft)) {
      // smtpPassword is role('secret'): the browser reads it back redacted
      // (empty), so an empty draft means "keep the stored value", not "clear".
      if (field === 'smtpPassword' && value === '') continue
      if (value === undefined || value === null || value === '') {
        await this.scope.unset(field)
      } else {
        await this.scope.set(field, value)
      }
    }
  }

  private async resetAll(): Promise<void> {
    const snapshot = this.scope.getSnapshot()
    const user = snapshot.user as Record<string, unknown> | undefined
    // smtpPassword is a redacted secret: it never appears in user, so clear it explicitly.
    await this.scope.unset('smtpPassword')
    if (user === undefined) return
    for (const field of Object.keys(user)) {
      await this.scope.unset(field)
    }
  }

  private async sendTest(): Promise<void> {
    const response = await fetch('/api/dsh-email-notify/test', { method: 'POST' })
    let body: { ok?: boolean; error?: string } | undefined
    try {
      body = await response.json() as { ok?: boolean; error?: string }
    } catch {
      body = undefined
    }
    if (!response.ok || body?.ok !== true) {
      throw new Error(body?.error ?? `HTTP ${response.status}`)
    }
  }
}

export type EmailNotifySettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'email-notify'>
  & InjectFace<EmailNotifySettingsCardFace>

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  color: 'var(--dsw-alias-label-primary)',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '14px 16px',
}

const titleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.4,
}

const descriptionStyle: CSSProperties = {
  margin: '4px 0 0',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 13,
  lineHeight: 1.5,
}

const bodyStyle: CSSProperties = {
  borderTop: '1px solid var(--dsw-alias-border-l2)',
  margin: '0 16px',
  padding: '8px 0 12px',
}

const footerStyle: CSSProperties = {
  borderTop: '1px solid var(--dsw-alias-border-l2)',
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  margin: '0 16px',
  padding: '12px 0 16px',
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '12px 0',
}

const labelStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.5,
}

const hintStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 12,
  lineHeight: 1.5,
}

const inputStyle: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'var(--dsw-alias-bg-layer-3)',
  color: 'var(--dsw-alias-label-primary)',
  borderRadius: 8,
  padding: '0 12px',
  height: 34,
  fontSize: 13,
  lineHeight: 1.5,
  width: '100%',
  boxSizing: 'border-box',
  font: 'inherit',
}

const textareaStyle: CSSProperties = {
  ...inputStyle,
  height: 'auto',
  minHeight: 80,
  paddingTop: 7,
  paddingBottom: 7,
  resize: 'vertical',
  font: 'inherit',
}

const buttonBaseStyle: CSSProperties = {
  appearance: 'none',
  font: 'inherit',
  cursor: 'pointer',
  border: '1px solid transparent',
  borderRadius: 8,
  padding: '6px 16px',
  fontSize: 13,
  lineHeight: 1.5,
}

const primaryButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: 'var(--dsw-alias-label-primary)',
  color: 'var(--dsw-alias-bg-layer-3)',
}

const secondaryButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  borderColor: 'var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
}

const disabledButtonStyle: CSSProperties = {
  opacity: 0.4,
  cursor: 'default',
}

interface FieldProps {
  label: string
  hint: string
  children: ReactNode
}

function Field(props: FieldProps) {
  return (
    <div style={fieldStyle}>
      <span style={labelStyle}>{props.label}</span>
      {props.children}
      <span style={hintStyle}>{props.hint}</span>
    </div>
  )
}

interface TextFieldProps {
  label: string
  hint: string
  value: string
  placeholder?: string
  type?: string
  disabled?: boolean
  onChange: (value: string) => void
}

function TextField(props: TextFieldProps) {
  return (
    <Field label={props.label} hint={props.hint}>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(event) => { props.onChange(event.target.value) }}
        style={inputStyle}
      />
    </Field>
  )
}

interface NumberFieldProps {
  label: string
  hint: string
  value: number | undefined
  disabled?: boolean
  onChange: (value: number | undefined) => void
}

function NumberField(props: NumberFieldProps) {
  return (
    <Field label={props.label} hint={props.hint}>
      <input
        type="number"
        value={props.value ?? ''}
        disabled={props.disabled}
        onChange={(event) => {
          const text = event.target.value.trim()
          if (text === '') {
            props.onChange(undefined)
            return
          }
          const parsed = Number(text)
          props.onChange(Number.isFinite(parsed) ? parsed : undefined)
        }}
        style={inputStyle}
      />
    </Field>
  )
}

interface BooleanFieldProps {
  label: string
  hint: string
  value: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}

function BooleanField(props: BooleanFieldProps) {
  return (
    <Field label={props.label} hint={props.hint}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--dsw-alias-label-primary)', fontSize: 13, lineHeight: 1.5 }}>
        <input
          type="checkbox"
          checked={props.value}
          disabled={props.disabled}
          onChange={(event) => { props.onChange(event.target.checked) }}
          style={{ accentColor: 'var(--dsw-alias-brand-primary)' }}
        />
        {props.value ? '开' : '关'}
      </label>
    </Field>
  )
}

interface TextAreaFieldProps {
  label: string
  hint: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}

function TextAreaField(props: TextAreaFieldProps) {
  return (
    <Field label={props.label} hint={props.hint}>
      <textarea
        value={props.value}
        disabled={props.disabled}
        rows={4}
        onChange={(event) => { props.onChange(event.target.value) }}
        style={textareaStyle}
      />
    </Field>
  )
}

interface EmailNotifySettingsFormProps {
  t: (key: EmailNotifyKey) => string
  state: EmailNotifySettingsCardState
  save: (draft: EmailNotifySettings) => Promise<void>
  resetAll: () => Promise<void>
  sendTest: () => Promise<void>
}

function EmailNotifySettingsForm(props: EmailNotifySettingsFormProps) {
  const { t, state } = props
  const [draft, setDraft] = useState<EmailNotifySettings>({})
  const [seeded, setSeeded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>()
  const [autoReviewAvailable, setAutoReviewAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetch(API.approvalAvailability, { method: 'POST' })
      .then(async response => await response.json() as { ok?: boolean; autoReview?: boolean })
      .then((body) => {
        if (!cancelled) setAutoReviewAvailable(body.ok === true && body.autoReview === true)
      })
      .catch(() => {
        if (!cancelled) setAutoReviewAvailable(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!seeded && state.status === 'ready') {
      setDraft(state.config ?? {})
      setSeeded(true)
    }
  }, [seeded, state.status, state.config])

  if (state.status === 'loading') return null

  const disabled = !state.writable || saving || testing
  const update = (field: keyof EmailNotifySettings, value: unknown): void => {
    setDraft(current => ({ ...current, [field]: value }))
  }
  const clearNotice = (): void => { setNotice(undefined) }

  const onSave = async (): Promise<void> => {
    setSaving(true)
    setNotice(undefined)
    try {
      await props.save(draft)
      setNotice({ kind: 'ok', text: t('settings.saved') })
    } catch (error) {
      setNotice({ kind: 'error', text: t('settings.saveFailed') + ': ' + (error instanceof Error ? error.message : String(error)) })
    } finally {
      setSaving(false)
    }
  }

  const onReset = async (): Promise<void> => {
    setSaving(true)
    setNotice(undefined)
    try {
      await props.resetAll()
      setDraft(state.config ?? {})
      setNotice({ kind: 'ok', text: t('settings.saved') })
    } catch (error) {
      setNotice({ kind: 'error', text: t('settings.saveFailed') + ': ' + (error instanceof Error ? error.message : String(error)) })
    } finally {
      setSaving(false)
    }
  }

  const onTest = async (): Promise<void> => {
    setTesting(true)
    setNotice(undefined)
    try {
      await props.save(draft)
      await props.sendTest()
      setNotice({ kind: 'ok', text: t('settings.testMailOk') })
    } catch (error) {
      setNotice({ kind: 'error', text: t('settings.testMailFailed') + ': ' + (error instanceof Error ? error.message : String(error)) })
    } finally {
      setTesting(false)
    }
  }

  const noticeStyle: CSSProperties = {
    margin: '8px 0 0',
    fontSize: 12,
    lineHeight: 1.5,
    color: notice?.kind === 'ok' ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-error)',
  }

  return (
    <div>
      <div style={bodyStyle}>
        <BooleanField
          label={t('settings.enabled')}
          hint={t('settings.enabledHint')}
          value={draft.enabled ?? true}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('enabled', value) }}
        />
        <BooleanField
          label={t('settings.announceToAgent')}
          hint={t('settings.announceToAgentHint')}
          value={draft.announceToAgent ?? true}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('announceToAgent', value) }}
        />
        <BooleanField
          label={t('settings.watchTaskBoard')}
          hint={t('settings.watchTaskBoardHint')}
          value={draft.watchTaskBoard ?? true}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('watchTaskBoard', value) }}
        />
        <NumberField
          label={t('settings.pollIntervalMs')}
          hint={t('settings.pollIntervalMsHint')}
          value={draft.pollIntervalMs}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('pollIntervalMs', value) }}
        />
        <BooleanField
          label={t('settings.approvalNotifyEnabled')}
          hint={t('settings.approvalNotifyEnabledHint')}
          value={draft.approvalNotifyEnabled ?? false}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('approvalNotifyEnabled', value) }}
        />
        <BooleanField
          label={t('settings.approvalNotifyWorkspace')}
          hint={t('settings.approvalNotifyWorkspaceHint')}
          value={draft.approvalNotifyWorkspace ?? true}
          disabled={disabled || !(draft.approvalNotifyEnabled ?? false)}
          onChange={(value) => { clearNotice(); update('approvalNotifyWorkspace', value) }}
        />
        <BooleanField
          label={t('settings.approvalNotifyAutoReview')}
          hint={autoReviewAvailable ? t('settings.approvalNotifyAutoReviewHint') : t('settings.approvalNotifyAutoReviewUnavailable')}
          value={autoReviewAvailable && (draft.approvalNotifyAutoReview ?? true)}
          disabled={disabled || !(draft.approvalNotifyEnabled ?? false) || !autoReviewAvailable}
          onChange={(value) => { clearNotice(); update('approvalNotifyAutoReview', value) }}
        />
        <TextField
          label={t('settings.smtpHost')}
          hint={t('settings.smtpHostHint')}
          value={draft.smtpHost ?? ''}
          placeholder="smtp.qq.com"
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('smtpHost', value) }}
        />
        <NumberField
          label={t('settings.smtpPort')}
          hint={t('settings.smtpPortHint')}
          value={draft.smtpPort}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('smtpPort', value) }}
        />
        <BooleanField
          label={t('settings.smtpSecure')}
          hint={t('settings.smtpSecureHint')}
          value={draft.smtpSecure ?? true}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('smtpSecure', value) }}
        />
        <TextField
          label={t('settings.smtpUser')}
          hint={t('settings.smtpUserHint')}
          value={draft.smtpUser ?? ''}
          placeholder="123456@qq.com"
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('smtpUser', value) }}
        />
        <TextField
          label={t('settings.smtpPassword')}
          hint={t('settings.smtpPasswordHint')}
          value={draft.smtpPassword ?? ''}
          type="password"
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('smtpPassword', value) }}
        />
        <TextField
          label={t('settings.mailFrom')}
          hint={t('settings.mailFromHint')}
          value={draft.mailFrom ?? ''}
          placeholder="DSH <123456@qq.com>"
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('mailFrom', value) }}
        />
        <TextAreaField
          label={t('settings.mailTo')}
          hint={t('settings.mailToHint')}
          value={draft.mailTo ?? ''}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('mailTo', value) }}
        />
        <TextField
          label={t('settings.subjectTemplate')}
          hint={t('settings.subjectTemplateHint')}
          value={draft.subjectTemplate ?? ''}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('subjectTemplate', value) }}
        />
        <TextAreaField
          label={t('settings.bodyTemplate')}
          hint={t('settings.bodyTemplateHint')}
          value={draft.bodyTemplate ?? ''}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('bodyTemplate', value) }}
        />
        <TextField
          label={t('settings.conversationSubjectTemplate')}
          hint={t('settings.conversationSubjectTemplateHint')}
          value={draft.conversationSubjectTemplate ?? ''}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('conversationSubjectTemplate', value) }}
        />
        <TextAreaField
          label={t('settings.conversationBodyTemplate')}
          hint={t('settings.conversationBodyTemplateHint')}
          value={draft.conversationBodyTemplate ?? ''}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('conversationBodyTemplate', value) }}
        />
        <TextField
          label={t('settings.approvalSubjectTemplate')}
          hint={t('settings.approvalSubjectTemplateHint')}
          value={draft.approvalSubjectTemplate ?? ''}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('approvalSubjectTemplate', value) }}
        />
        <TextAreaField
          label={t('settings.approvalBodyTemplate')}
          hint={t('settings.approvalBodyTemplateHint')}
          value={draft.approvalBodyTemplate ?? ''}
          disabled={disabled}
          onChange={(value) => { clearNotice(); update('approvalBodyTemplate', value) }}
        />
      </div>

      <footer style={footerStyle}>
        {notice !== undefined
          ? <p style={noticeStyle} role="status">{notice.text}</p>
          : null}
        <button
          type="button"
          disabled={disabled}
          style={disabled ? { ...primaryButtonStyle, ...disabledButtonStyle } : primaryButtonStyle}
          onClick={() => { void onSave() }}
        >
          {t(saving ? 'settings.saving' : 'settings.save')}
        </button>
        <button
          type="button"
          disabled={disabled}
          style={disabled ? { ...secondaryButtonStyle, ...disabledButtonStyle } : secondaryButtonStyle}
          onClick={() => { void onReset() }}
        >
          {t('settings.resetAll')}
        </button>
        <button
          type="button"
          disabled={disabled}
          style={disabled ? { ...secondaryButtonStyle, ...disabledButtonStyle } : secondaryButtonStyle}
          onClick={() => { void onTest() }}
        >
          {t(testing ? 'settings.testingMail' : 'settings.testMail')}
        </button>
      </footer>
    </div>
  )
}

export function EmailNotifySettingsSection(props: EmailNotifySettingsSectionProps) {
  const state = props.useEmailNotifySettingsCard(snapshot => snapshot)
  return (
    <div style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>{props.t('settings.title')}</h2>
          <p style={descriptionStyle}>{props.t('settings.description')}</p>
        </div>
      </div>
      <EmailNotifySettingsForm
        t={props.t}
        state={state}
        save={props.save}
        resetAll={props.resetAll}
        sendTest={props.sendTest}
      />
    </div>
  )
}
