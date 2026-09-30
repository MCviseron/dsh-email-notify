import type { ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { SettingsConflictError, type SettingsPathOp } from '@deepseek-ai/dsh-settings'

/**
 * One namespace view as the settings service serializes it. Structural on
 * purpose: 0.1.x `SettingsProvider` and 0.2 `SettingsForms` both return these
 * fields (0.2 adds `autoGenerate`/`applies`), so one build spans generations.
 */
export interface SettingsBridgeView {
  ns: unknown
  schema?: unknown
  value?: unknown
  base?: unknown
  user?: unknown
  revision: number
  secrets?: Array<{ path: readonly string[]; set: boolean }>
}

/** The provider face this loopback bridge uses, on every settings generation. */
export interface SettingsBridge {
  readonly writable?: boolean
  describe: (options?: { redactSecrets?: boolean }) => SettingsBridgeView[]
  mutate: (ns: string, ops: readonly SettingsPathOp[], expectedRevision?: number) => Promise<void>
}
import { isLoopbackRequest } from './loopback.ts'
import type { EmailNotifier } from './notifier.ts'

export const EMAIL_NOTIFY_API = {
  test: '/api/dsh-email-notify/test',
  describe: '/api/dsh-email-notify/settings/describe',
  mutate: '/api/dsh-email-notify/settings/mutate',
  conversationNotifyDescribe: '/api/dsh-email-notify/conversation-notify/describe',
  conversationNotifySet: '/api/dsh-email-notify/conversation-notify/set',
  approvalAvailability: '/api/dsh-email-notify/approval/availability',
  approvalStatus: '/api/dsh-email-notify/approval/status',
} as const

const MAX_BODY_BYTES = 64 * 1024

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: Parameters<WebRoute['handler']>[0]): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

/**
 * Whether a settings write was refused as stale. Class check plus the stable
 * machine code, because the throwing host may run a different copy of
 * `@deepseek-ai/dsh-settings` than this plugin's own dependency — a cross-copy
 * `instanceof` is false even when both copies are the same version.
 */
function isSettingsConflict(error: unknown): error is SettingsConflictError {
  if (error instanceof SettingsConflictError) return true
  return (error as { code?: unknown } | null)?.code === 'SETTINGS_CONFLICT'
}

function toView(descriptor: SettingsBridgeView): unknown {
  return {
    ns: String(descriptor.ns),
    schema: descriptor.schema,
    value: descriptor.value,
    ...(descriptor.base === undefined ? {} : { base: descriptor.base }),
    ...(descriptor.user === undefined ? {} : { user: descriptor.user }),
    ...(descriptor.secrets === undefined ? {} : { secrets: descriptor.secrets.map(secret => ({ path: [...secret.path], set: secret.set })) }),
    revision: descriptor.revision,
  }
}

export function makeEmailNotifyRoutes(notifier: EmailNotifier, isAutoReviewAvailable: () => boolean = () => false): WebRoute[] {
  const test: WebRoute = {
    kind: 'exact',
    path: EMAIL_NOTIFY_API.test,
    handler: async (req, res): Promise<void> => {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isLoopbackRequest(req)) return json(res, 403, { ok: false, error: 'forbidden' })
      try {
        await notifier.sendTestEmail()
        json(res, 200, { ok: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        json(res, 400, { ok: false, error: message })
      }
    },
  }

  const approvalAvailability: WebRoute = {
    kind: 'exact',
    path: EMAIL_NOTIFY_API.approvalAvailability,
    handler: async (req, res): Promise<void> => {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isLoopbackRequest(req)) return json(res, 403, { ok: false, error: 'forbidden' })
      json(res, 200, {
        ok: true,
        workspace: true,
        autoReview: isAutoReviewAvailable(),
      })
    },
  }

  const approvalStatus: WebRoute = {
    kind: 'exact',
    path: EMAIL_NOTIFY_API.approvalStatus,
    handler: async (req, res): Promise<void> => {
      if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isLoopbackRequest(req)) return json(res, 403, { ok: false, error: 'forbidden' })
      json(res, 200, { ok: true, autoReview: isAutoReviewAvailable(), ...notifier.getApprovalStatus() })
    },
  }

  const conversationNotifyDescribe: WebRoute = {
    kind: 'exact',
    path: EMAIL_NOTIFY_API.conversationNotifyDescribe,
    handler: async (req, res): Promise<void> => {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isLoopbackRequest(req)) return json(res, 403, { ok: false, error: 'forbidden' })
      const body = await readJsonBody(req)
      const sessionId = typeof body === 'object' && body !== null && typeof (body as { sessionId?: unknown }).sessionId === 'string'
        ? (body as { sessionId: string }).sessionId
        : ''
      if (sessionId === '') return json(res, 400, { ok: false, error: '缺少 sessionId' })
      json(res, 200, { ok: true, enabled: notifier.isConversationNotify(sessionId) })
    },
  }

  const conversationNotifySet: WebRoute = {
    kind: 'exact',
    path: EMAIL_NOTIFY_API.conversationNotifySet,
    handler: async (req, res): Promise<void> => {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isLoopbackRequest(req)) return json(res, 403, { ok: false, error: 'forbidden' })
      const body = await readJsonBody(req)
      if (body === undefined || typeof body !== 'object' || body === null) return json(res, 400, { ok: false, error: 'unreadable JSON body' })
      const { sessionId, enabled } = body as { sessionId?: unknown; enabled?: unknown }
      if (typeof sessionId !== 'string' || sessionId === '') return json(res, 400, { ok: false, error: '缺少 sessionId' })
      if (typeof enabled !== 'boolean') return json(res, 400, { ok: false, error: 'enabled 必须是布尔值' })
      await notifier.setConversationNotify(sessionId, enabled)
      json(res, 200, { ok: true, enabled })
    },
  }

  return [test, approvalAvailability, approvalStatus, conversationNotifyDescribe, conversationNotifySet]
}

export function makeEmailNotifySettingsRoutes(settings: SettingsBridge): WebRoute[] {
  const view = (): SettingsBridgeView | undefined => {
    const descriptors = settings.describe({ redactSecrets: true })
    return descriptors.find(descriptor => String(descriptor.ns) === 'email-notify')
  }

  const describe: WebRoute = {
    kind: 'exact',
    path: EMAIL_NOTIFY_API.describe,
    handler: async (req, res): Promise<void> => {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isLoopbackRequest(req)) return json(res, 403, { ok: false, error: 'forbidden' })
      const descriptor = view()
      json(res, 200, {
        ok: true,
        value: {
          namespaces: descriptor === undefined ? [] : [toView(descriptor)],
          writable: settings.writable !== false,
        },
      })
    },
  }

  const mutate: WebRoute = {
    kind: 'exact',
    path: EMAIL_NOTIFY_API.mutate,
    handler: async (req, res): Promise<void> => {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isLoopbackRequest(req)) return json(res, 403, { ok: false, error: 'forbidden' })
      const body = await readJsonBody(req)
      if (body === undefined || typeof body !== 'object' || body === null) {
        return json(res, 400, { ok: false, code: 'settings-rejected', message: 'unreadable JSON body' })
      }
      const record = body as { ns?: unknown; ops?: unknown; expectedRevision?: unknown }
      if (record.ns !== 'email-notify' || !Array.isArray(record.ops)) {
        return json(res, 400, { ok: false, code: 'settings-rejected', message: 'malformed settings request' })
      }
      const ops = record.ops as SettingsPathOp[]
      if (!ops.every(op => (op.op === 'set' || op.op === 'unset') && Array.isArray(op.path) && op.path.every(part => typeof part === 'string'))) {
        return json(res, 400, { ok: false, code: 'settings-rejected', message: 'malformed settings operation' })
      }
      const expectedRevision = typeof record.expectedRevision === 'number' ? record.expectedRevision : undefined
      try {
        await settings.mutate('email-notify', ops, expectedRevision)
      } catch (error) {
        if (isSettingsConflict(error)) {
          return json(res, 200, { ok: false, code: 'settings-conflict', message: error.message })
        }
        const message = error instanceof Error ? error.message : String(error)
        return json(res, 200, { ok: false, code: 'settings-rejected', message })
      }
      const descriptor = view()
      if (descriptor === undefined) {
        return json(res, 200, { ok: false, code: 'internal', message: 'email-notify settings namespace was disposed' })
      }
      json(res, 200, { ok: true, value: toView(descriptor) })
    },
  }

  return [describe, mutate]
}
