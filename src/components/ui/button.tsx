import type { ComponentProps } from 'react'
import { Button as AriaButton } from 'react-aria-components'
import { cn } from '@/lib/utils'

const variants = {
  default: 'button-primary',
  primary: 'button-primary',
  outline: 'button-outline',
  secondary: 'button-secondary',
  ghost: 'button-ghost',
  destructive: 'button-destructive',
  link: 'button-ghost',
} as const

const sizes = {
  default: '',
  xs: 'button-small',
  sm: 'button-small',
  lg: '',
  icon: 'button-icon',
  'icon-xs': 'button-icon',
  'icon-sm': 'button-icon',
  'icon-lg': 'button-icon',
} as const

export function Button({
  className,
  variant = 'default',
  size = 'default',
  disabled,
  isDisabled,
  ...props
}: ComponentProps<typeof AriaButton> & {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  disabled?: boolean
}) {
  return (
    <AriaButton
      className={cn('button', variants[variant], sizes[size], className)}
      isDisabled={disabled ?? isDisabled}
      {...props}
    />
  )
}
