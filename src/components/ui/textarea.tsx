import type { ComponentProps } from 'react'
import { TextArea } from 'react-aria-components'
import { cn } from '@/lib/utils'

export function Textarea({ className, ...props }: ComponentProps<typeof TextArea>) {
  return <TextArea className={cn('textarea', className)} {...props} />
}
