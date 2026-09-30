import { useEffect, useState, type CSSProperties } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { EmailNotifyKey } from './locales.ts'

const API = {
  describe: '/api/dsh-email-notify/conversation-notify/describe',
  set: '/api/dsh-email-notify/conversation-notify/set',
} as const

export type ConversationNotifyCheckboxProps =
  PropsRuntime<'conversation.input.left'>
  & PropsLocale<'email-notify'>

const labelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 6px',
  height: 28,
  borderRadius: 8,
  fontSize: 13,
  lineHeight: 1.4,
  color: 'var(--dsw-alias-label-primary)',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
}

export function ConversationNotifyCheckbox(props: ConversationNotifyCheckboxProps) {
  const { t } = props
  const sessionId = (props as { sessionId?: string }).sessionId
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (sessionId === undefined || sessionId === '') {
      setEnabled(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void fetch(API.describe, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (response) => await response.json() as { ok?: boolean; enabled?: boolean })
      .then((body) => {
        if (!cancelled) setEnabled(body.enabled === true)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [sessionId])

  if (sessionId === undefined || sessionId === '') return null

  const onChange = (next: boolean): void => {
    setEnabled(next)
    setLoading(true)
    void fetch(API.set, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, enabled: next }),
    })
      .then(async (response) => await response.json() as { ok?: boolean })
      .then((body) => {
        if (body.ok !== true) setEnabled(!next)
      })
      .catch(() => { setEnabled(!next) })
      .finally(() => { setLoading(false) })
  }

  return (
    <label style={labelStyle} title={t('conversation.notifyHint')}>
      <input
        type="checkbox"
        checked={enabled}
        disabled={loading}
        onChange={(event) => { onChange(event.target.checked) }}
        style={{ accentColor: 'var(--dsw-alias-brand-primary)', cursor: 'pointer' }}
      />
      <span>{t('conversation.notify')}</span>
    </label>
  )
}
