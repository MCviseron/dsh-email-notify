import { createSnapshotStore, type SettingsScope, type SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

interface BridgeView {
  ns: string
  value: unknown
  base?: unknown
  user?: unknown
  revision: number
  secrets?: Array<{ path: string[]; set: boolean }>
}

interface DescribeResponse {
  namespaces: BridgeView[]
  writable: boolean
}

interface MutateResponse {
  ok: boolean
  value?: BridgeView
  code?: string
  message?: string
}

interface SettingsOp {
  op: 'set' | 'unset'
  path: string[]
  value?: unknown
}

const API = {
  describe: '/api/dsh-email-notify/settings/describe',
  mutate: '/api/dsh-email-notify/settings/mutate',
} as const

/**
 * A minimal SettingsScope backed by the dsh-email-notify Host settings bridge.
 * DSH 0.1.0-rc.6's official settings apiproxy does not expose third-party
 * namespaces, so this plugin owns the loopback bridge and the browser scope
 * talks to it directly instead of using webUiSettings.
 */
export function createEmailNotifySettingsScope<T>(): SettingsScope<T> {
  const store = createSnapshotStore<SettingsScopeSnapshot<T>>({
    status: 'loading',
    value: undefined,
    base: undefined,
    user: undefined,
    revision: undefined,
    writable: false,
    mode: 'host',
  })

  let tail = Promise.resolve()
  let disposed = false

  const post = async (path: string, body: unknown): Promise<unknown> => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    return await response.json()
  }

  const read = async (): Promise<void> => {
    if (disposed) return
    try {
      const body = await post(API.describe, {}) as { ok?: boolean; value?: DescribeResponse }
      if (body.ok !== true || body.value === undefined) throw new Error('settings bridge unavailable')
      const view = body.value.namespaces.find(candidate => candidate.ns === 'email-notify')
      if (view === undefined) throw new Error('email-notify settings namespace not exposed')
      accept(view, body.value.writable)
    } catch {
      if (!disposed) {
        store.update((draft) => { draft.status = 'unavailable' })
      }
    }
  }

  const accept = (view: BridgeView, writable: boolean): void => {
    if (disposed) return
    store.set({
      status: 'ready',
      value: view.value as T | undefined,
      base: view.base,
      user: view.user,
      revision: view.revision,
      writable,
      mode: 'host',
    })
  }

  const write = async (ops: SettingsOp[]): Promise<void> => {
    if (disposed) return
    const revision = store.getSnapshot().revision
    try {
      const body = await post(API.mutate, {
        ns: 'email-notify',
        ops,
        ...(revision === undefined ? {} : { expectedRevision: revision }),
      }) as MutateResponse
      if (body.ok !== true || body.value === undefined) {
        await read()
        throw new Error(body.message ?? body.code ?? 'settings write failed')
      }
      accept(body.value, store.getSnapshot().writable)
    } catch {
      await read().catch(() => {})
      throw new Error('settings write failed')
    }
  }

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    if (disposed) return Promise.resolve()
    const task = tail.then(operation, operation)
    tail = task.catch(() => {})
    return task
  }

  void read()

  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: listener => store.subscribe(listener),
    set: (field, value) => enqueue(() => write([{ op: 'set', path: [field], value }])),
    unset: field => enqueue(() => write([{ op: 'unset', path: [field] }])),
  }
}
