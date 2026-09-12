import { Fragment, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, Form, Textarea } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Alert, Badge, Spinner, Switch } from '@/components/ui/surfaces'
import type { Definition } from '@/kernel/definition'
import { money, type BusinessRecord } from '@/lib/client'
import { actionPreview, fieldLabel, statusLabel, statusVariant } from '@/lib/project-ui'
import type { RecordData } from '@/kernel/definition'

export function CreateRequestDialog({ open, busy, onOpenChange, onCreate }: {
  open: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (data: Record<string, string | number | boolean>) => void
}) {
  const [category, setCategory] = useState('Office')
  const [verified, setVerified] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New purchase request" description="The request starts as a draft. Submit it when it is ready for review.">
      <Form onSubmit={event => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        onCreate({
          title: String(values.get('title')),
          supplier: String(values.get('supplier')),
          amountCents: Math.round(Number(values.get('amount')) * 100),
          category,
          justification: String(values.get('justification')),
          supplierVerified: verified,
        })
      }}>
        <FieldGroup>
          <Field name="title" isRequired minLength={3} maxLength={100}><FieldLabel>Request</FieldLabel><Input /><FieldError /></Field>
          <Field name="supplier" isRequired minLength={2} maxLength={80}><FieldLabel>Supplier</FieldLabel><Input /><FieldError /></Field>
          <Field name="amount" type="number" isRequired><FieldLabel>Amount (USD)</FieldLabel><Input step="0.01" min="0.01" /><FieldError /></Field>
          <Select label="Category" value={category} onChange={setCategory} options={['Software', 'Equipment', 'Services', 'Office'].map(value => ({ value, label: value }))} />
          <Field name="justification" isRequired minLength={5} maxLength={1000}><FieldLabel>Business reason</FieldLabel><Textarea /><FieldError /></Field>
          <Switch label="Supplier is already verified" checked={verified} onChange={setVerified} />
          <Button type="submit" disabled={busy}>{busy ? <Spinner data-icon="inline-start" /> : null}Create request</Button>
        </FieldGroup>
      </Form>
    </Dialog>
  )
}

export function CreateEntityDialog({ open, definition, busy, onOpenChange, onCreate }: {
  open: boolean
  definition: Definition
  busy: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (data: Record<string, string | number | boolean>) => void
}) {
  const fields = Object.entries(definition.entity.fields).filter(([, field]) => field.editable)
  const enums = Object.fromEntries(fields.filter(([, field]) => field.type === 'enum').map(([key, field]) => [key, field.options?.[0] ?? '']))
  const [choices, setChoices] = useState(enums)
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  useEffect(() => {
    setChoices(enums)
    setFlags(Object.fromEntries(fields.filter(([, field]) => field.type === 'boolean').map(([key, field]) => [key, Boolean(field.default)])))
  }, [definition.slug, open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`New ${definition.entity.label.toLowerCase()}`} description={`${definition.entity.label} starts as a draft.`}>
      <Form onSubmit={event => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        const data: Record<string, string | number | boolean> = { ...choices, ...flags }
        for (const [key, field] of fields) {
          if (field.type === 'enum' || field.type === 'boolean') continue
          if (key === 'amountCents') {
            data[key] = Math.round(Number(values.get('amount')) * 100)
            continue
          }
          const raw = String(values.get(key) ?? '')
          data[key] = field.type === 'integer' ? Number(raw) : raw
        }
        onCreate(data)
      }}>
        <FieldGroup>
          {fields.map(([key, field]) => {
            if (field.type === 'boolean') {
              return <Switch key={key} label={field.label} checked={Boolean(flags[key])} onChange={value => setFlags(current => ({ ...current, [key]: value }))} />
            }
            if (field.type === 'enum') {
              return <Select key={key} label={field.label} value={choices[key] ?? ''} onChange={value => setChoices(current => ({ ...current, [key]: value }))} options={(field.options ?? []).map(value => ({ value, label: value }))} />
            }
            if (key === 'amountCents') {
              return (
                <Field key={key} name="amount" type="number" isRequired>
                  <FieldLabel>Amount (USD)</FieldLabel>
                  <Input step="0.01" min="0.01" />
                  <FieldError />
                </Field>
              )
            }
            const long = field.type === 'string' && (field.max ?? 0) > 200
            return (
              <Field key={key} name={key} type={field.type === 'integer' ? 'number' : 'text'} isRequired={field.required} minLength={field.type === 'string' ? field.min : undefined} maxLength={field.type === 'string' ? field.max : undefined}>
                <FieldLabel>{field.label}</FieldLabel>
                {long ? <Textarea /> : <Input />}
                <FieldError />
              </Field>
            )
          })}
          <Button type="submit" disabled={busy}>{busy ? <Spinner data-icon="inline-start" /> : null}Create {definition.entity.label.toLowerCase()}</Button>
        </FieldGroup>
      </Form>
    </Dialog>
  )
}

export function ActionDialog({ open, actionName, record, definition, role, busy, onOpenChange, onSubmit }: {
  open: boolean
  actionName?: string
  record?: BusinessRecord
  definition: Definition
  role: string
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (action: string, input: Record<string, unknown>) => void
}) {
  const action = definition.actions.find(item => item.name === actionName)
  if (!action || !record) return null
  const preview = actionPreview(definition, record, action.name, role)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={action.label} description={action.description}>
      <Form onSubmit={event => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        const input: Record<string, unknown> = {}
        for (const [key, field] of Object.entries(action.input)) {
          const raw = String(values.get(key) ?? '')
          input[key] = field.type === 'integer' ? Number(raw) : field.type === 'boolean' ? values.get(key) === 'true' : raw
        }
        onSubmit(action.name, input)
      }}>
        <FieldGroup>
          {preview && !preview.allowed
            ? <Alert variant="warning">This will be blocked. Staging still records the failed checks.</Alert>
            : <Alert>This stages a change. Apply it to commit.</Alert>}
          {Object.entries(action.input).map(([key, field]) => {
            const current = record.data[key]
            if (field.type === 'integer') {
              return (
                <Field key={key} name={key} type="number" isRequired={field.required} defaultValue={typeof current === 'number' ? String(current) : undefined}>
                  <FieldLabel>{fieldLabel(key, field.label)}</FieldLabel>
                  <Input min={field.min} max={field.max} />
                  <FieldError />
                </Field>
              )
            }
            const long = field.type === 'string' && (field.max ?? 0) > 200
            return (
              <Field key={key} name={key} isRequired={field.required} minLength={field.min} maxLength={field.max} defaultValue={typeof current === 'string' ? current : undefined}>
                <FieldLabel>{field.label}</FieldLabel>
                {long ? <Textarea /> : <Input />}
                <FieldError />
              </Field>
            )
          })}
          <Button type="submit" disabled={busy}>{busy ? <Spinner data-icon="inline-start" /> : null}Stage</Button>
        </FieldGroup>
      </Form>
    </Dialog>
  )
}

export function RecordFields({ definition, data }: { definition: Definition; data: RecordData }) {
  return (
    <dl className="kv">
      {Object.entries(definition.entity.fields).map(([key, field]) => {
        const value = data[key]
        if (value === undefined || value === '') return null
        if (key === 'confidence' && data.assessed !== true) return null
        if (key === 'assessed' && value !== true) return null
        return (
          <Fragment key={key}>
            <dt>{fieldLabel(key, field.label)}</dt>
            <dd>
              {key === 'amountCents' ? money(value)
                : key === 'confidence' ? `${value}%`
                : key === 'status' ? <Badge variant={statusVariant(String(value))}>{statusLabel(String(value))}</Badge>
                : key === 'supplierVerified' ? (value ? 'Verified' : 'Unverified')
                : field.type === 'boolean' ? (value ? 'Yes' : 'No')
                : String(value)}
            </dd>
          </Fragment>
        )
      })}
    </dl>
  )
}

export function PendingApply({ record, action, busy, canReview, onReject, onApply }: {
  record: BusinessRecord
  action: string
  busy: boolean
  canReview: boolean
  onReject: () => void
  onApply: () => void
}) {
  return (
    <div className="pending-panel">
      <Badge variant="warning">Pending · {action}</Badge>
      <p>A change is waiting on {String(record.data.title)}. Apply it to commit, or reject it.</p>
      {canReview ? (
        <div className="actions">
          <Button variant="destructive" disabled={busy} onPress={onReject}>Reject</Button>
          <Button disabled={busy} onPress={onApply}>{busy ? <Spinner data-icon="inline-start" /> : null}Apply</Button>
        </div>
      ) : <p className="muted">An owner must apply this change.</p>}
    </div>
  )
}
