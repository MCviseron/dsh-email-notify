import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { EmailNotifySettingsCardController, EmailNotifySettingsSection, type EmailNotifySettings } from './EmailNotifySettingsCard.tsx'
import { ConversationNotifyCheckbox } from './ConversationNotifyCheckbox.tsx'
import { createEmailNotifySettingsScope } from './settings-scope.ts'
import { en, zh, type EmailNotifyKey } from './locales.ts'

const NS = 'email-notify'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'email-notify': EmailNotifyKey
  }

  interface SlotMap {
    'conversation.input.left': {
      kind: 'list'
      scope: 'session'
      owner: ConversationInputLeftOwnerProps
    }
  }
}

export interface ConversationInputLeftOwnerProps {
  children?: never
}

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'email-notify: dictionaries')

  const settingsScope = createEmailNotifySettingsScope<EmailNotifySettings>()
  const controller = new EmailNotifySettingsCardController(settingsScope)

  ctx.slots.inject('settings.section', () => {
    const unregister = ctx.slots.register({
      name: 'settings.section',
      id: 'email-notify',
      order: 140,
      label: () => ctx.locale.bind(NS)('settings.title'),
      locale: NS,
      inject: () => controller.inject(),
    }, EmailNotifySettingsSection)
    return () => {
      controller.dispose()
      unregister()
    }
  })

  ctx.slots.inject('conversation.input.left', () => {
    const unregister = ctx.slots.register({
      name: 'conversation.input.left',
      id: 'email-notify-conversation',
      order: -10,
      locale: NS,
    }, ConversationNotifyCheckbox)
    return () => { unregister() }
  })
}
