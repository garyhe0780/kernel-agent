import { useState } from 'react'
import { Button } from './ui/button'
import { Field, FieldError, FieldGroup, FieldLabel, Form } from './ui/form-field'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { Alert, Switch } from './ui/surfaces'
import { validateApplication, type Application } from '@/kernel/application'
import type { Field as EntityField } from '@/kernel/definition'

export function ApplicationFieldEditor({ application, entitySlug, disabled, onChange }: { application: Application; entitySlug: string; disabled: boolean; onChange: (app: Application) => void }) {
  const [kind, setKind] = useState('string')
  const [required, setRequired] = useState(false)
  const [hasDefault, setHasDefault] = useState(false)
  const [error, setError] = useState('')
  return <details className="field-editor"><summary>Add a field</summary>
    <p className="muted">An optional field leaves existing records unchanged. A default fills records where the field is not set.</p>
    <Form onSubmit={event => {
      event.preventDefault()
      const values = new FormData(event.currentTarget)
      const key = String(values.get('key')).trim()
      const label = String(values.get('label')).trim()
      const entity = application.entities.find(e => e.slug === entitySlug)!
      try {
        if (Object.hasOwn(entity.entity.fields, key)) throw new Error('A field with this identifier already exists.')
        const raw = String(values.get('default') ?? '')
        const field: EntityField = { label, type: kind as EntityField['type'], required, editable: true,
          ...(hasDefault ? { default: kind === 'integer' ? Number(raw) : kind === 'boolean' ? raw === 'true' : raw } : {}),
        }
        if (hasDefault && kind === 'integer' && raw.trim() === '') throw new Error('Enter a numeric default.')
        const app = validateApplication({ ...application, entities: application.entities.map(e => e.slug === entitySlug ? { ...e, entity: { ...e.entity, fields: { ...e.entity.fields, [key]: field } } } : e) })
        onChange(app); setError(''); event.currentTarget.reset()
      } catch (e) { setError(e instanceof Error ? e.message : 'Check the field definition.') }
    }}>
      <FieldGroup>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <Field name="label" isRequired isDisabled={disabled} maxLength={80}><FieldLabel>Field label</FieldLabel><Input placeholder="Department" /><FieldError /></Field>
        <Field name="key" isRequired isDisabled={disabled} pattern="[a-z][a-zA-Z0-9_]{0,49}" maxLength={50}><FieldLabel>Field identifier</FieldLabel><Input placeholder="department" /><FieldError /></Field>
        <Select label="Field type" value={kind} onChange={setKind} options={[{ value: 'string', label: 'Text' }, { value: 'integer', label: 'Whole number' }, { value: 'boolean', label: 'Yes / no' }]} />
        <Switch label="Required" checked={required} onChange={setRequired} />
        <Switch label="Provide a default for new and existing records" checked={hasDefault} onChange={setHasDefault} />
        {hasDefault ? kind === 'boolean' ? <Field name="default" defaultValue="false" isDisabled={disabled}><FieldLabel>Default (true or false)</FieldLabel><Input pattern="true|false" /><FieldError /></Field> : <Field name="default" type={kind === 'integer' ? 'number' : 'text'} isDisabled={disabled}><FieldLabel>Default value</FieldLabel><Input step={kind === 'integer' ? '1' : undefined} /><FieldError /></Field> : null}
        <Button type="submit" variant="outline" disabled={disabled}>Add to draft</Button>
      </FieldGroup>
    </Form>
  </details>
}
