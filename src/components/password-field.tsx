import { useId, useState, type ReactNode } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from './ui/form-field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './ui/input-group'

export function PasswordField({ label, autoComplete, newPassword = false, name = 'password', labelAction }: {
  label: string
  autoComplete: 'new-password' | 'current-password'
  newPassword?: boolean
  name?: string
  labelAction?: ReactNode
}) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  return (
    <Field name={name} type={visible ? 'text' : 'password'} isRequired minLength={newPassword ? 10 : undefined} maxLength={newPassword ? 128 : undefined}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>{label}</FieldLabel>
        {labelAction}
      </div>
      <InputGroup className="password-input-group">
        <InputGroupInput id={id} autoComplete={autoComplete} />
        <InputGroupAddon align="inline-end">
          <InputGroupButton className="password-visibility" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-controls={id} onPress={() => setVisible(value => !value)}>
            {visible ? 'hide' : 'show'}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {newPassword ? <FieldDescription>Use 10–128 characters.</FieldDescription> : null}
      <FieldError />
    </Field>
  )
}
