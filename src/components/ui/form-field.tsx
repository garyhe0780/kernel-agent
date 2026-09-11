import type { ComponentProps, ReactNode } from 'react'
import { TextField, Label, FieldError as AriaFieldError, Form } from 'react-aria-components'
import { cn } from '@/lib/utils'
import { Textarea } from './textarea'

export { Form, Textarea }

export function FieldGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('field-group', className)}>{children}</div>
}

export function Field({ className, ...props }: ComponentProps<typeof TextField>) {
  return <TextField className={cn('field', typeof className === 'string' && className)} {...props} />
}

export function FieldLabel(props: ComponentProps<typeof Label>) {
  return <Label className="field-label" {...props} />
}

export function FieldError() {
  return <AriaFieldError className="field-error" />
}

export function FieldDescription({ children }: { children: ReactNode }) {
  return <span className="field-description">{children}</span>
}
