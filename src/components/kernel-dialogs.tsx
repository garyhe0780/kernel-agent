import { Fragment, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, Form, Textarea } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Alert, Badge, Spinner, Switch } from '@/components/ui/surfaces'
import { validateFields, type Definition } from '@/kernel/definition'
import { money, date, type Proposal, type BusinessRecord } from '@/lib/client'
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

export function CreateEntityDialog({ open, definition, records = [], error, busy, onOpenChange, onCreate }: {
  open: boolean
  definition: Definition
  records?: BusinessRecord[]
  error?: string
  busy: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (data: Record<string, string | number | boolean>) => void
}) {
  const [validationError, setValidationError] = useState('')
  const fields = Object.entries(definition.entity.fields).filter(([, field]) => field.editable)
  const enums = Object.fromEntries(fields.filter(([, field]) => field.type === 'enum').map(([key, field]) => [key, String(field.default ?? field.options?.[0] ?? '')]))
  const [choices, setChoices] = useState(enums)
  const [references, setReferences] = useState<Record<string, string>>({})
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  useEffect(() => {
    setChoices(enums)
    setReferences({})
    setValidationError('')
    setFlags(Object.fromEntries(fields.filter(([, field]) => field.type === 'boolean').map(([key, field]) => [key, Boolean(field.default)])))
  }, [definition.slug, open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`New ${definition.entity.label.toLowerCase()}`} description={`Create a ${definition.entity.label.toLowerCase()} in this application.`}>
      <Form onSubmit={event => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        const data: Record<string, string | number | boolean> = { ...choices, ...flags, ...references }
        for (const [key, field] of fields) {
          if (field.type === 'enum' || field.type === 'boolean' || field.reference) continue
          if (key === 'amountCents') {
            data[key] = Math.round(Number(values.get('amount')) * 100)
            continue
          }
          const raw = String(values.get(key) ?? '')
          if (raw === '' && !field.required) continue
          data[key] = field.type === 'integer' ? Number(raw) : raw
        }
        try {
          setValidationError('')
          const valid = validateFields(definition.entity.fields, data, true)
          for (const [key, field] of fields) {
            if (field.reference && ((field.required && !valid[key]) || (valid[key] && !records.some(r => r.id === valid[key] && r.capability === field.reference)))) throw new Error(`Choose an existing ${field.label.toLowerCase()}. Create one in its entity queue first if the list is empty.`)
          }
          onCreate(data)
        } catch (caught) { setValidationError(caught instanceof Error ? caught.message : 'Check the required fields.') }
      }}>
        <FieldGroup>
          {validationError || error ? <Alert variant="danger">{validationError || error}</Alert> : null}
          {fields.map(([key, field]) => {
            if (field.reference) return <Select key={key} label={`${field.label}${field.required ? ' (required)' : ''}`} value={references[key] ?? ''} onChange={value => setReferences(current => ({ ...current, [key]: value }))} options={[{ value: '', label: `Choose ${field.label.toLowerCase()}` }, ...records.filter(r => r.capability === field.reference).map(r => ({ value: r.id, label: String(r.data.title) }))]} />
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
                {long ? <Textarea /> : <Input min={field.type === 'integer' ? field.min : undefined} max={field.type === 'integer' ? field.max : undefined} />}
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

export function ActionDialog({ open, actionName, record, definition, records = [], previewOnly = false, error, role, busy, onOpenChange, onSubmit }: {
  open: boolean
  actionName?: string
  previewOnly?: boolean
  error?: string
  records?: BusinessRecord[]
  record?: BusinessRecord
  definition: Definition
  role: string
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (action: string, input: Record<string, unknown>) => void
}) {
  const [validationError, setValidationError] = useState('')
  const [choices, setChoices] = useState<Record<string, string>>({})
  useEffect(() => { setChoices({}); setValidationError('') }, [actionName, open])
  const action = definition.actions.find(item => item.name === actionName)
  if (!action || !record) return null
  const preview = actionPreview(definition, record, action.name, role)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={action.label} description={`${String(record.data.title)}${record.data.amountCents !== undefined ? ` · ${money(record.data.amountCents)}` : ''}. ${action.description}`}>
      <Form onSubmit={event => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        const input: Record<string, unknown> = {}
        for (const [key, field] of Object.entries(action.input)) {
          const raw = choices[key] ?? String(values.get(key) ?? '')
          if (raw === '' && !field.required) continue
          if (raw === '' && field.type === 'boolean') { input[key] = undefined; continue }
          input[key] = field.type === 'integer' ? Number(raw) : field.type === 'boolean' ? raw === 'true' : raw
        }
        try {
          setValidationError('')
          validateFields(action.input, input)
          onSubmit(action.name, input)
        } catch (caught) { setValidationError(caught instanceof Error ? caught.message : 'Check the action input.') }
      }}>
        <FieldGroup>
          {validationError || error ? <Alert variant="danger">{validationError || error}</Alert> : null}
          {preview && !preview.allowed
            ? <Alert variant="warning">{previewOnly ? 'This example action will be blocked by the rules below.' : 'This will be blocked. Staging still records the failed checks.'}</Alert>
            : <Alert>{previewOnly ? 'Test the rules on this example record. No live data will change.' : 'This creates a proposal. Review its changes before applying it.'}</Alert>}
          {Object.entries(action.input).map(([key, field]) => {
            if (field.reference || field.type === 'enum' || field.type === 'boolean') {
              const options = field.reference ? records.filter(r => r.capability === field.reference).map(r => ({ value: r.id, label: String(r.data.title) })) : field.type === 'boolean' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : (field.options ?? []).map(value => ({ value, label: value }))
              return <Select key={key} label={field.label} value={choices[key] ?? ''} onChange={value => setChoices(current => ({ ...current, [key]: value }))} options={[{ value: '', label: 'Choose a value' }, ...options]} />
            }
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
          <Button type="submit" disabled={busy}>{busy ? <Spinner data-icon="inline-start" /> : null}{previewOnly ? 'Test action' : 'Create proposal'}</Button>
        </FieldGroup>
      </Form>
    </Dialog>
  )
}

export function RecordFields({ definition, data, records = [], showEmpty = false }: { definition: Definition; data: RecordData; records?: BusinessRecord[]; showEmpty?: boolean }) {
  return (
    <dl className="kv">
      {Object.entries(definition.entity.fields).map(([key, field]) => {
        const value = data[key]
        if (!showEmpty && (value === undefined || value === '')) return null
        if (key === 'confidence' && data.assessed !== true) return null
        if (key === 'assessed' && value !== true) return null
        return (
          <Fragment key={key}>
            <dt>{fieldLabel(key, field.label)}</dt>
            <dd>
              {value === undefined || value === '' ? 'Not set' : field.reference ? String(records.find(r => r.id === value)?.data.title ?? value)
                : key === 'amountCents' ? money(value)
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

export function PendingApply({ record, proposal, definition, records = [], busy, canReview, onReject, onApply }: {
  record: BusinessRecord
  proposal: Proposal
  definition: Definition
  records?: BusinessRecord[]
  busy: boolean
  canReview: boolean
  onReject: () => void
  onApply: () => void
}) {
  const action = definition.actions.find(item => item.name === proposal.action)
  const fields = Object.fromEntries(Object.entries(definition.entity.fields).filter(([key]) => proposal.before[key] !== proposal.after[key]))
  const changed = { ...definition, entity: { ...definition.entity, fields } }
  const stale = record.version !== proposal.recordVersion
  return (
    <section className="pending-panel" aria-label="Review proposed change">
      <h3>Review {action?.label.toLowerCase() ?? proposal.action}</h3>
      <Badge variant="warning">Pending human review</Badge>
      <p>{proposal.proposerName ?? (proposal.actorKind === 'agent' ? 'Agent' : 'Workspace member')} · {date(proposal.createdAt)}</p>
      {stale ? <Alert variant="warning">This record changed after the proposal. Reject it and create a fresh proposal.</Alert> : null}
      <div className="diff">
        <div className="diff-col"><h4>Before</h4><RecordFields definition={changed} data={proposal.before} records={records} showEmpty /></div>
        <div className="diff-col"><h4>Proposed</h4><RecordFields definition={changed} data={proposal.after} records={records} showEmpty /></div>
      </div>
      {Object.keys(fields).length === 0 ? <p>No field values change.</p> : null}
      {Object.keys(proposal.input ?? {}).length ? <details><summary>Submitted information</summary><RecordFields definition={{ ...definition, entity: { ...definition.entity, fields: action?.input ?? {} } }} data={proposal.input ?? {}} records={records} showEmpty /></details> : null}
      <details><summary>Policy checks ({proposal.checks.filter(check => check.passed).length}/{proposal.checks.length} passed)</summary>{proposal.checks.map(check => <div className="check" key={check.id}><span>{check.label}: {check.message}</span><Badge variant={check.passed ? 'success' : 'danger'}>{check.passed ? 'Passed' : 'Blocked'}</Badge></div>)}</details>
      <p>Applying commits these changes to {String(record.data.title)}. The server rechecks access, versions and policies.</p>
      {canReview ? <div className="actions">
        <Button variant="outline" disabled={busy} onPress={onReject}>Reject proposal</Button>
        <Button disabled={busy || stale} onPress={onApply}>{busy ? <Spinner data-icon="inline-start" /> : null}Apply reviewed change</Button>
      </div> : <p className="muted">An owner must apply this change.</p>}
    </section>
  )
}
