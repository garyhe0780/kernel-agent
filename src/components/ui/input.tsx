import type { ComponentProps } from 'react'
import { Input as AriaInput } from 'react-aria-components'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: ComponentProps<typeof AriaInput>) {
  return <AriaInput className={cn('input', className)} {...props} />
}
