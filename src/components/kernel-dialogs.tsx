import { actionFormData, actionReferenceFields, relationshipSelection, validateRelationshipSelections } from '@/lib/relationship-selection'
import { useAssignmentMembers, memberLabel } from './record-context'
import { Fragment, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, Form, Textarea } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Alert, Badge, Spinner, Switch } from '@/components/ui/surfaces'
import { validateFields, type Definition } from '@/kernel/definition'
import { recordSections, type RecordLayout } from '@/kernel/application-layouts'
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

export function CreateEntityDialog({ open, definition, layout, records = [], initialReferences = {}, error, busy, onOpenChange, onCreate }: {
  open: boolean
  definition: Definition
  layout?: RecordLayout
  records?: BusinessRecord[]
  initialReferences?: Record<string, string>
  error?: string
  busy: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (data: Record<string, string | number | boolean>) => void
}) {
  const members = useAssignmentMembers()
  const [validationError, setValidationError] = useState('')
  const fields = recordSections(definition, layout).flatMap(section => section.fields).map(key => [key, definition.entity.fields[key]] as const).filter(([, field]) => field.editable)
  const enums = Object.fromEntries(fields.filter(([, field]) => (field.type === 'enum' || field.format === 'user')).map(([key, field]) => [key, String(field.default ?? field.options?.[0] ?? '')]))
  const [choices, setChoices] = useState(enums)
  const [references, setReferences] = useState<Record<string, string>>({})
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  useEffect(() => {
    setChoices(enums)
    setReferences(initialReferences)
    setValidationError('')
    setFlags(Object.fromEntries(fields.filter(([, field]) => field.type === 'boolean').map(([key, field]) => [key, Boolean(field.default)])))
  }, [definition.slug, open])
  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }} title={`New ${definition.entity.label.toLowerCase()}`} description={`Add ${definition.entity.label.toLowerCase()} details below.`}>
      <Form onSubmit={event => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        const data: Record<string, string | number | boolean> = { ...choices, ...flags }
        for (const [key, value] of Object.entries(references)) {
          if (value) data[key] = value
        }
        for (const [key, field] of fields) {
          if (field.type === 'enum' || field.type === 'boolean' || field.reference || field.format === 'user') continue
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
          validateRelationshipSelections(definition.entity.fields, valid, records)
          onCreate(data)
        } catch (caught) { setValidationError(caught instanceof Error ? caught.message : 'Check the required fields.') }
      }}>
        <FieldGroup>
          {validationError || error ? <Alert variant="danger">{validationError || error}</Alert> : null}
          {fields.map(([key, field]) => {
            if (field.format === 'user') return <Select key={key} label={field.label} value={choices[key] ?? ''} onChange={value => setChoices(current => ({ ...current, [key]: value }))} options={[{ value: '', label: 'Unassigned' }, ...members.map(member => ({ value: member.id, label: member.name }))]} />
            if (field.reference && initialReferences[key]) return <p key={key}><strong>{field.label}:</strong> {String(records.find(record => record.id === initialReferences[key] && record.capability === field.reference)?.data.title ?? 'Unavailable record')}</p>
            if (field.reference) {
              const selection = relationshipSelection(field, [field], definition.entity.fields, references, records, references[key] ?? '')
              return <Select key={key} label={`${field.label}${field.required ? ' (required)' : ''}`} value={references[key] ?? ''} onChange={value => { setReferences(current => ({ ...current, [key]: value })); setValidationError('') }} {...selection} />
            }
            if (field.type === 'boolean') {
              return <Switch key={key} label={field.label} checked={Boolean(flags[key])} onChange={value => setFlags(current => ({ ...current, [key]: value }))} />
            }
            if (field.type === 'enum') {
              return <Select key={key} label={field.label} value={choices[key] ?? ''} onChange={value => setChoices(current => ({ ...current, [key]: value }))} options={(field.options ?? []).map(value => ({ value, label: value }))} />
            }
            if (key === 'amountCents') {
              return (
                <Field key={key} name="amount" type="number" isRequired defaultValue={field.default === undefined ? undefined : String(Number(field.default) / 100)}>
                  <FieldLabel>Amount (USD)</FieldLabel>
                  <Input step="0.01" min={(field.min ?? 0) / 100} />
                  <FieldError />
                </Field>
              )
            }
            const long = field.type === 'string' && (field.max ?? 0) > 200
            return (
              <Field key={key} name={key} type={field.type === 'integer' ? 'number' : 'text'} isRequired={field.required} minLength={field.type === 'string' ? field.min : undefined} maxLength={field.type === 'string' ? field.max : undefined}>
                <FieldLabel>{field.label}</FieldLabel>
                {long ? <Textarea /> : <Input type={field.format === 'date' ? 'date' : undefined} min={field.type === 'integer' ? field.min : undefined} max={field.type === 'integer' ? field.max : undefined} />}
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
  const members = useAssignmentMembers()
  const [validationError, setValidationError] = useState('')
  const [choices, setChoices] = useState<Record<string, string>>({})
  const action = definition.actions.find(item => item.name === actionName)
  const initial = (key: string) => {
    const target = Object.entries(action?.effects ?? {}).find(([field, mapping]) => mapping === `$input.${key}` && definition.entity.fields[field])?.[0]
    if (target && definition.entity.fields[target].editable) return record?.data[target]
    // Outcome dates stamp when the action happens; the person can still change it.
    if (target && action?.input[key]?.format === 'date' && !action.input[key].default) return new Date().toLocaleDateString('en-CA')
    return action?.input[key]?.default
  }
  useEffect(() => {
    setChoices(Object.fromEntries(Object.keys(action?.input ?? {}).flatMap(key => initial(key) === undefined ? [] : [[key, String(initial(key))]])))
    setValidationError('')
  }, [actionName, open, record?.id])
  if (!action || !record) return null
  const formData = actionFormData(action, record.data, choices)
  const preview = actionPreview(definition, record, action.name, role)
  const unmet = preview?.checks.filter(check => !check.passed && check.id !== 'permission' && check.id !== 'state') ?? []
  const blockedDirect = !previewOnly && action.humanExecution === 'direct' && unmet.length > 0
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={action.label} description={`${String(record.data.title)}${record.data.amountCents !== undefined ? ` · ${money(record.data.amountCents)}` : ''}. ${action.description}`}>
      <Form onSubmit={event => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        const input: Record<string, unknown> = {}
        for (const [key, field] of Object.entries(action.input)) {
          const raw = field.reference || field.format === 'user' || field.type === 'enum' || field.type === 'boolean' ? choices[key] ?? '' : String(values.get(key) ?? '')
          if (raw === '' && !field.required) continue
          if (raw === '' && field.type === 'boolean') { input[key] = undefined; continue }
          input[key] = field.type === 'integer' ? (key === 'amountCents' ? Math.round(Number(raw) * 100) : Number(raw)) : field.type === 'boolean' ? raw === 'true' : raw
        }
        try {
          setValidationError('')
          const valid = validateFields(action.input, input)
          if (!previewOnly) validateRelationshipSelections(definition.entity.fields, actionFormData(action, record.data, valid), records)
          onSubmit(action.name, input)
        } catch (caught) { setValidationError(caught instanceof Error ? caught.message : 'Check the action input.') }
      }}>
        <FieldGroup>
          {validationError || error ? <Alert variant="danger">{validationError || error}</Alert> : null}
          {blockedDirect
            ? <Alert variant="warning"><strong>Complete these first:</strong><ul className="builder-assumptions">{unmet.map(check => <li key={check.id}>{check.label}</li>)}</ul>Use Edit to fill in the missing details.</Alert>
            : preview && !preview.allowed
            ? <Alert variant="warning">{previewOnly ? 'This example action will be blocked by the rules below.' : 'This will be blocked. Staging still records the failed checks.'}</Alert>
            : <Alert>{previewOnly ? 'Test the rules on this example record. No live data will change.' : action.humanExecution === 'direct' ? 'Saving applies this change immediately and records it in activity.' : 'This creates a proposal. Review its changes before applying it.'}</Alert>}
          {Object.entries(action.input).map(([key, field]) => {
            if (field.reference) {
              const targets = actionReferenceFields(definition, action, key)
              const selection = relationshipSelection(field, targets.length ? targets : [field], definition.entity.fields, formData, records, choices[key] ?? '')
              return <Select key={key} label={field.label} value={choices[key] ?? ''} onChange={value => { setChoices(current => ({ ...current, [key]: value })); setValidationError('') }} {...selection} />
            }
            if (field.reference || field.format === 'user' || field.type === 'enum' || field.type === 'boolean') {
              const options = field.format === 'user' ? members.map(member => ({ value: member.id, label: member.name })) : field.reference ? records.filter(r => r.capability === field.reference).map(r => ({ value: r.id, label: String(r.data.title) })) : field.type === 'boolean' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : (field.options ?? []).map(value => ({ value, label: value }))
              return <Select key={key} label={field.label} value={choices[key] ?? ''} onChange={value => setChoices(current => ({ ...current, [key]: value }))} options={[{ value: '', label: 'Choose a value' }, ...options]} />
            }
            const current = initial(key)
            if (field.type === 'integer') {
              return (
                <Field key={key} name={key} type="number" isRequired={field.required} defaultValue={typeof current === 'number' ? String(key === 'amountCents' ? current / 100 : current) : undefined}>
                  <FieldLabel>{key === 'amountCents' ? 'Amount (USD)' : field.label}</FieldLabel>
                  <Input step={key === 'amountCents' ? 0.01 : 1} min={key === 'amountCents' && field.min !== undefined ? field.min / 100 : field.min} max={key === 'amountCents' && field.max !== undefined ? field.max / 100 : field.max} />
                  <FieldError />
                </Field>
              )
            }
            const long = field.type === 'string' && (field.max ?? 0) > 200
            return (
              <Field key={key} name={key} isRequired={field.required && field.default !== ''} minLength={field.min} maxLength={field.max} defaultValue={typeof current === 'string' ? current : undefined}>
                <FieldLabel>{field.label}</FieldLabel>
                {long ? <Textarea /> : <Input type={field.format === 'date' ? 'date' : undefined} />}
                <FieldError />
              </Field>
            )
          })}
          <Button type="submit" disabled={busy || blockedDirect}>{busy ? <Spinner data-icon="inline-start" /> : null}{previewOnly ? 'Test action' : action.humanExecution === 'direct' ? 'Save changes' : 'Create proposal'}</Button>
        </FieldGroup>
      </Form>
    </Dialog>
  )
}

export function RecordFields({ definition, data, records = [], showEmpty = false }: { definition: Definition; data: RecordData; records?: BusinessRecord[]; showEmpty?: boolean }) {
  const members = useAssignmentMembers()
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
              {value === undefined || value === '' ? 'Not set' : field.format === 'user' ? memberLabel(members, value) : field.reference ? String(records.find(r => r.id === value)?.data.title ?? value)
                : key === 'amountCents' ? money(value)
                : key === 'confidence' || field.format === 'percent' ? `${value}%`
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

export function PendingApply({ record, proposal, definition, definitionVersion, records = [], busy, canReview, onReject, onApply }: {
  record?: BusinessRecord
  proposal: Proposal
  definition: Definition
  definitionVersion?: number
  records?: BusinessRecord[]
  busy: boolean
  canReview: boolean
  onReject: () => void
  onApply: () => void
}) {
  const action = definition.actions.find(item => item.name === proposal.action)
  const fields = Object.fromEntries(Object.entries(definition.entity.fields).filter(([key]) => proposal.before[key] !== proposal.after[key]))
  const changed = { ...definition, entity: { ...definition.entity, fields } }
  const creating = proposal.kind === 'create'
  const stale = (definitionVersion !== undefined && definitionVersion !== proposal.definitionVersion) || (!creating && (!record || record.version !== proposal.recordVersion))
  return (
    <section className="pending-panel" aria-label="Review proposed change">
      <h3>{creating ? `Create ${definition.entity.label.toLowerCase()}: ${proposal.after.title}` : `Review ${action?.label.toLowerCase() ?? proposal.action}`}</h3>
      <Badge variant="warning">Pending human review</Badge>
      <p>{proposal.proposerName ?? (proposal.actorKind === 'agent' ? 'Agent' : 'Workspace member')} · {date(proposal.createdAt)}</p>
      {stale ? <Alert variant="warning">This record changed after the proposal, or its definition changed. Reject it and create a fresh proposal.</Alert> : null}
      <div className="diff">
        <div className="diff-col"><h4>Before</h4>{creating ? <p>No record exists yet.</p> : <RecordFields definition={changed} data={proposal.before} records={records} showEmpty />}</div>
        <div className="diff-col"><h4>Proposed</h4><RecordFields definition={changed} data={proposal.after} records={records} showEmpty /></div>
      </div>
      {Object.keys(fields).length === 0 ? <p>No field values change.</p> : null}
      {Object.keys(proposal.input ?? {}).length ? <details><summary>Submitted information</summary><RecordFields definition={{ ...definition, entity: { ...definition.entity, fields: creating ? Object.fromEntries(Object.entries(definition.entity.fields).filter(([, field]) => field.editable)) : action?.input ?? {} } }} data={proposal.input ?? {}} records={records} showEmpty /></details> : null}
      <details><summary>Policy checks ({proposal.checks.filter(check => check.passed).length}/{proposal.checks.length} passed)</summary>{proposal.checks.map(check => <div className="check" key={check.id}><span>{check.label}: {check.message}</span><Badge variant={check.passed ? 'success' : 'danger'}>{check.passed ? 'Passed' : 'Blocked'}</Badge></div>)}</details>
      <p>{creating ? "Approval creates this record once. The server rechecks permission, definition version, field values and relationships." : `Applying commits these changes to ${String(record?.data.title)}. The server rechecks access, versions and policies.`}</p>
      {canReview ? <div className="actions">
        <Button variant="outline" disabled={busy} onPress={onReject}>Reject proposal</Button>
        <Button disabled={busy || stale} onPress={onApply}>{busy ? <Spinner data-icon="inline-start" /> : null}{creating ? "Create reviewed record" : "Apply reviewed change"}</Button>
      </div> : <p className="muted">An owner must apply this change.</p>}
    </section>
  )
}
