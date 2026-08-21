import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { EmailNotifySettingsCard, EmailNotifySettingsCardController, type EmailNotifySettings } from './EmailNotifySettingsCard.tsx'
import { createEmailNotifySettingsScope } from './settings-scope.ts'
import { en, zh, type EmailNotifyKey } from './locales.ts'

const NS = 'email-notify'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'email-notify': EmailNotifyKey
  }

  interface SlotMap {
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

export interface SettingsPluginItemOwnerProps {
  children?: never
}

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'email-notify: dictionaries')

  const settingsScope = createEmailNotifySettingsScope<EmailNotifySettings>()
  const controller = new EmailNotifySettingsCardController(settingsScope)

  ctx.slots.inject('web-ui.plugin.item', () => {
    const unregister = ctx.slots.register({
      name: 'web-ui.plugin.item',
      id: 'email-notify',
      order: 140,
      locale: NS,
      inject: () => controller.inject(),
    }, EmailNotifySettingsCard)
    return () => {
      controller.dispose()
      unregister()
    }
  })
}
