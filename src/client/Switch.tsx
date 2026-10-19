import type { CSSProperties } from 'react'

/** Official Settings Switch styles, copied from the DSH primitive with a plugin prefix. */
export const switchCss = `
.dsh-email-notify-switch {
  box-sizing: border-box;
  position: relative;
  flex: 0 0 auto;
  width: 36px;
  height: 20px;
  padding: 2px;
  border: 0;
  border-radius: 999px;
  corner-shape: round;
  background: var(--dsw-alias-border-l3);
  cursor: pointer;
}
.dsh-email-notify-switch[aria-checked='true'] {
  background: var(--dsw-alias-brand-primary);
}
.dsh-email-notify-switch:disabled {
  cursor: default;
  opacity: 0.5;
}
.dsh-email-notify-switch:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.dsh-email-notify-switch__thumb {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  corner-shape: round;
  background: var(--dsw-alias-label-primary-foreground);
  transition: transform 120ms ease;
}
.dsh-email-notify-switch[aria-checked='false'] .dsh-email-notify-switch__thumb {
  background: var(--dsw-alias-switch-thumb);
}
.dsh-email-notify-switch[aria-checked='true'] .dsh-email-notify-switch__thumb {
  transform: translateX(16px);
}
`

export interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  title?: string
  className?: string
}

/** The official Settings Switch markup. */
export function Switch(props: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      title={props.title}
      disabled={props.disabled}
      onClick={() => { props.onChange(!props.checked) }}
      className={props.className ?? 'dsh-email-notify-switch'}
    >
      <span aria-hidden="true" className="dsh-email-notify-switch__thumb" />
    </button>
  )
}
