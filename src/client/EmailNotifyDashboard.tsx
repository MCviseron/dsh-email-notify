import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { EmailNotifyKey } from './locales.ts'

const DASHBOARD_URL = '/api/dsh-email-notify/dashboard?days=14&recent=12'

interface DashboardTotals {
  total: number
  today: number
  last7: number
  last30: number
  ok: number
  fail: number
  successRate: number
  avgDurationMs: number
  lastAt: number
}

interface KindBucket {
  kind: string
  total: number
  ok: number
  fail: number
}

interface DayBucket {
  date: string
  total: number
  ok: number
  fail: number
}

interface SessionBucket {
  id: string
  name: string
  total: number
  ok: number
  fail: number
  lastAt: number
  kinds: Record<string, number>
}

interface AddressBucket {
  address: string
  total: number
  fail: number
}

interface SendEvent {
  id: string
  at: number
  kind: string
  ok: boolean
  durationMs: number
  sender: string
  recipients: string[]
  sessionId: string
  sessionName: string
  subject: string
  detail: string
  error?: string
}

interface DashboardData {
  generatedAt: number
  retainedEvents: number
  cap: number
  days: number
  totals: DashboardTotals
  byKind: KindBucket[]
  byDay: DayBucket[]
  bySession: SessionBucket[]
  byRecipient: AddressBucket[]
  bySender: AddressBucket[]
  recent: SendEvent[]
}

export interface EmailNotifyDashboardProps {
  t: (key: EmailNotifyKey) => string
}

const KIND_ORDER = ['conversation', 'automation', 'approval', 'ask', 'test', 'task'] as const
const KIND_KEY: Record<string, EmailNotifyKey> = {
  conversation: 'dashboard.kind.conversation',
  automation: 'dashboard.kind.automation',
  approval: 'dashboard.kind.approval',
  ask: 'dashboard.kind.ask',
  test: 'dashboard.kind.test',
  task: 'dashboard.kind.task',
}
const KIND_COLOR: Record<string, string> = {
  conversation: '#4f7cff',
  automation: '#10b981',
  approval: '#f59e0b',
  ask: '#8b5cf6',
  test: '#64748b',
  task: '#0ea5e9',
}

const cardStyle: CSSProperties = {
  margin: '0 16px 8px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-layer-3)',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  minWidth: 0,
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.5,
}

const subtleStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 12,
  lineHeight: 1.5,
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
  lineHeight: 1.5,
}

const thStyle: CSSProperties = {
  padding: '6px 8px',
  color: 'var(--dsw-alias-label-tertiary)',
  fontWeight: 500,
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  padding: '7px 8px',
  borderTop: '1px solid var(--dsw-alias-border-l2)',
  color: 'var(--dsw-alias-label-secondary)',
  verticalAlign: 'top',
}

function fmtInt(value: number): string {
  return new Intl.NumberFormat().format(value)
}

function fmtPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  const percent = value * 100
  return (percent >= 99.95 ? percent.toFixed(0) : percent.toFixed(1)) + '%'
}

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0ms'
  if (ms < 1000) return Math.round(ms) + 'ms'
  const seconds = ms / 1000
  if (seconds < 60) return seconds.toFixed(1) + 's'
  return Math.floor(seconds / 60) + 'm ' + Math.round(seconds % 60) + 's'
}

function fmtDateTime(at: number): string {
  if (!at) return '—'
  return new Date(at).toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function fmtDay(date: string): string {
  return date.slice(5).replace('-', '/')
}

function kindLabel(t: EmailNotifyDashboardProps['t'], kind: string): string {
  return t(KIND_KEY[kind] ?? 'dashboard.kind.other')
}

function sessionLabel(t: EmailNotifyDashboardProps['t'], session: SessionBucket): string {
  if (session.id === '__test__' || (session.total > 0 && session.kinds.test === session.total)) {
    return t('dashboard.kind.test')
  }
  return session.name.trim() !== '' ? session.name : (session.id !== '' ? session.id : t('dashboard.unknownSession'))
}

function eventSessionLabel(t: EmailNotifyDashboardProps['t'], event: SendEvent): string {
  if (event.kind === 'test') return t('dashboard.kind.test')
  return event.sessionName.trim() !== '' ? event.sessionName : (event.sessionId !== '' ? event.sessionId : t('dashboard.unknownSession'))
}

function StatCard(props: { label: string; value: string; hint?: string; tone?: 'default' | 'danger' | 'success' }) {
  const color = props.tone === 'danger'
    ? 'var(--dsw-alias-label-error)'
    : props.tone === 'success'
      ? 'var(--dsw-alias-state-success-primary)'
      : 'var(--dsw-alias-label-primary)'
  return (
    <div style={{
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: 10,
      background: 'var(--dsw-alias-bg-layer-1)',
      padding: '10px 12px',
      minWidth: 0,
    }}>
      <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, lineHeight: 1.4 }}>{props.label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 600, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>{props.value}</div>
      {props.hint !== undefined ? (
        <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, lineHeight: 1.4 }}>{props.hint}</div>
      ) : null}
    </div>
  )
}

function SectionTitle(props: { children: ReactNode }) {
  return <h4 style={sectionTitleStyle}>{props.children}</h4>
}

function TrendChart(props: { data: DashboardData; t: EmailNotifyDashboardProps['t'] }) {
  const max = Math.max(1, ...props.data.byDay.map((day) => day.total))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 128, paddingTop: 6 }}>
      {props.data.byDay.map((day, index) => {
        const showLabel = props.data.byDay.length <= 10 || index % 2 === 0 || index === props.data.byDay.length - 1
        const title = day.date + ' · ' + props.t('dashboard.count') + ' ' + day.total + ' · ' + props.t('dashboard.ok') + ' ' + day.ok + ' · ' + props.t('dashboard.failed') + ' ' + day.fail
        return (
          <div key={day.date} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }} title={title}>
            <div style={{ height: 100, width: '100%', display: 'flex', flexDirection: 'column-reverse', gap: 1 }}>
              {day.ok > 0 ? <div style={{ height: (day.ok / max) * 100 + '%', background: 'var(--dsw-alias-brand-primary)', borderRadius: '3px 3px 0 0' }} /> : null}
              {day.fail > 0 ? <div style={{ height: (day.fail / max) * 100 + '%', background: 'var(--dsw-alias-label-error)', borderRadius: '3px 3px 0 0' }} /> : null}
              {day.total === 0 ? <div style={{ height: 2, background: 'var(--dsw-alias-border-l2)' }} /> : null}
            </div>
            <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 9, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
              {showLabel ? fmtDay(day.date) : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function TypeBreakdown(props: { data: DashboardData; t: EmailNotifyDashboardProps['t'] }) {
  const rows = KIND_ORDER
    .map((kind) => props.data.byKind.find((item) => item.kind === kind) ?? { kind, total: 0, ok: 0, fail: 0 })
    .filter((item) => item.total > 0)
  const max = Math.max(1, ...rows.map((item) => item.total))
  if (rows.length === 0) return <div style={subtleStyle}>{props.t('dashboard.noData')}</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 4 }}>
      {rows.map((item) => (
        <div key={item.kind} style={{ display: 'grid', gridTemplateColumns: '86px minmax(0, 1fr) 70px', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {kindLabel(props.t, item.kind)}
          </span>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--dsw-alias-bg-layer-1)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: (item.total / max) * 100 + '%', background: KIND_COLOR[item.kind] ?? 'var(--dsw-alias-brand-primary)', borderRadius: 999 }} />
          </div>
          <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {item.total}{item.fail > 0 ? <span style={{ color: 'var(--dsw-alias-label-error)' }}> / {item.fail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  )
}

function SessionTable(props: { data: DashboardData; t: EmailNotifyDashboardProps['t'] }) {
  if (props.data.bySession.length === 0) return <div style={subtleStyle}>{props.t('dashboard.noData')}</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{props.t('dashboard.session')}</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>{props.t('dashboard.count')}</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>{props.t('dashboard.failed')}</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>{props.t('dashboard.lastAt')}</th>
          </tr>
        </thead>
        <tbody>
          {props.data.bySession.slice(0, 8).map((session) => {
            const name = sessionLabel(props.t, session)
            return (
              <tr key={session.id + '|' + session.name}>
                <td style={tdStyle}>
                  <div style={{ color: 'var(--dsw-alias-label-primary)', fontWeight: 500, maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>
                  {session.id !== '' && session.id !== '__test__' ? <div style={{ ...subtleStyle, fontSize: 10, maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={session.id}>{session.id}</div> : null}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--dsw-alias-label-primary)', fontVariantNumeric: 'tabular-nums' }}>{session.total}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: session.fail > 0 ? 'var(--dsw-alias-label-error)' : 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{session.fail}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--dsw-alias-label-tertiary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(session.lastAt)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AddressList(props: { items: AddressBucket[]; t: EmailNotifyDashboardProps['t']; empty: string }) {
  if (props.items.length === 0) return <div style={subtleStyle}>{props.empty}</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {props.items.slice(0, 8).map((item) => (
        <div key={item.address} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.address}>{item.address}</span>
          <span style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {item.total}{item.fail > 0 ? <span style={{ color: 'var(--dsw-alias-label-error)' }}> / {item.fail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  )
}

function RecentTable(props: { data: DashboardData; t: EmailNotifyDashboardProps['t'] }) {
  if (props.data.recent.length === 0) return <div style={subtleStyle}>{props.t('dashboard.noData')}</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{props.t('dashboard.time')}</th>
            <th style={thStyle}>{props.t('dashboard.type')}</th>
            <th style={thStyle}>{props.t('dashboard.session')}</th>
            <th style={thStyle}>{props.t('dashboard.subject')}</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>{props.t('dashboard.status')}</th>
          </tr>
        </thead>
        <tbody>
          {props.data.recent.map((event) => (
            <tr key={event.id}>
              <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(event.at)}</td>
              <td style={tdStyle}>
                <span style={{ color: KIND_COLOR[event.kind] ?? 'var(--dsw-alias-label-secondary)' }}>{kindLabel(props.t, event.kind)}</span>
              </td>
              <td style={tdStyle}>
                <div style={{ color: 'var(--dsw-alias-label-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={eventSessionLabel(props.t, event)}>{eventSessionLabel(props.t, event)}</div>
              </td>
              <td style={tdStyle}>
                <div style={{ color: 'var(--dsw-alias-label-secondary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={event.error ?? event.subject}>{event.subject}</div>
                {event.error !== undefined ? <div style={{ color: 'var(--dsw-alias-label-error)', fontSize: 10, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={event.error}>{event.error}</div> : null}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', color: event.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-error)' }}>
                {event.ok ? props.t('dashboard.ok') : props.t('dashboard.failed')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EmailNotifyDashboard(props: EmailNotifyDashboardProps) {
  const [data, setData] = useState<DashboardData>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = async (silent = false): Promise<void> => {
    if (!silent) setLoading(true)
    setError(undefined)
    try {
      const response = await fetch(DASHBOARD_URL, { headers: { accept: 'application/json' } })
      const body = await response.json() as { ok?: boolean; error?: string } & Partial<DashboardData>
      if (!response.ok || body.ok !== true) throw new Error(body.error ?? 'HTTP ' + response.status)
      setData(body as DashboardData)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load(true) }, 20_000)
    return () => { clearInterval(timer) }
  }, [])

  const refreshButtonStyle: CSSProperties = {
    appearance: 'none',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    cursor: loading ? 'default' : 'pointer',
    font: 'inherit',
    fontSize: 12,
    lineHeight: 1.5,
    padding: '4px 10px',
    opacity: loading ? 0.5 : 1,
  }

  return (
    <section style={cardStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, color: 'var(--dsw-alias-label-primary)', fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{props.t('dashboard.title')}</h3>
          <p style={{ ...subtleStyle, margin: '4px 0 0' }}>{props.t('dashboard.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {data !== undefined ? <span style={{ ...subtleStyle, fontSize: 11 }}>{props.t('dashboard.updated')} {fmtDateTime(data.generatedAt)}</span> : null}
          <button type="button" style={refreshButtonStyle} disabled={loading} onClick={() => { void load() }}>
            {loading ? props.t('dashboard.refreshing') : props.t('dashboard.refresh')}
          </button>
        </div>
      </header>

      {error !== undefined ? (
        <div style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: '10px 12px', color: 'var(--dsw-alias-label-error)', fontSize: 12 }}>
          {props.t('dashboard.unavailable')}{error !== '' ? ': ' + error : ''}
        </div>
      ) : null}

      {data === undefined && loading ? <div style={subtleStyle}>{props.t('dashboard.loading')}</div> : null}

      {data !== undefined && data.totals.total === 0 ? (
        <div style={{ border: '1px dashed var(--dsw-alias-border-l2)', borderRadius: 10, padding: '22px 16px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: 1.6 }}>
          <div>{props.t('dashboard.empty')}</div>
          <div style={{ marginTop: 6, fontSize: 11 }}>{props.t('dashboard.emptyHint')}</div>
        </div>
      ) : null}

      {data !== undefined && data.totals.total > 0 ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            <StatCard label={props.t('dashboard.total')} value={fmtInt(data.totals.total)} hint={props.t('dashboard.records') + ' ' + fmtInt(data.retainedEvents)} />
            <StatCard label={props.t('dashboard.today')} value={fmtInt(data.totals.today)} hint={props.t('dashboard.last7') + ' ' + fmtInt(data.totals.last7)} />
            <StatCard label={props.t('dashboard.last7')} value={fmtInt(data.totals.last7)} hint={props.t('dashboard.last30') + ' ' + fmtInt(data.totals.last30)} />
            <StatCard label={props.t('dashboard.successRate')} value={fmtPercent(data.totals.successRate)} hint={fmtInt(data.totals.ok) + ' / ' + fmtInt(data.totals.total)} tone={data.totals.successRate >= 0.95 ? 'success' : 'default'} />
            <StatCard label={props.t('dashboard.failed')} value={fmtInt(data.totals.fail)} hint={props.t('dashboard.lastSent') + ' ' + fmtDateTime(data.totals.lastAt)} tone={data.totals.fail > 0 ? 'danger' : 'default'} />
            <StatCard label={props.t('dashboard.avgDuration')} value={fmtDuration(data.totals.avgDurationMs)} hint={props.t('dashboard.records') + ' ' + fmtInt(data.retainedEvents)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div>
              <SectionTitle>{props.t('dashboard.trend')}</SectionTitle>
              <TrendChart data={data} t={props.t} />
            </div>
            <div>
              <SectionTitle>{props.t('dashboard.byType')}</SectionTitle>
              <TypeBreakdown data={data} t={props.t} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div>
              <SectionTitle>{props.t('dashboard.bySession')}</SectionTitle>
              <SessionTable data={data} t={props.t} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <SectionTitle>{props.t('dashboard.byRecipient')}</SectionTitle>
                <AddressList items={data.byRecipient} t={props.t} empty={props.t('dashboard.noData')} />
              </div>
              <div>
                <SectionTitle>{props.t('dashboard.bySender')}</SectionTitle>
                <AddressList items={data.bySender} t={props.t} empty={props.t('dashboard.noData')} />
              </div>
            </div>
          </div>

          <div>
            <SectionTitle>{props.t('dashboard.recent')}</SectionTitle>
            <RecentTable data={data} t={props.t} />
          </div>
        </>
      ) : null}
    </section>
  )
}
