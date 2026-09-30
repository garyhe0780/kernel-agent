import { useEffect, useRef, useState } from 'react'
import { Check, ArrowRight, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'
import { AssignmentMembers } from './record-context'
import { PendingApply, RecordFields } from './kernel-dialogs'
import { Button } from './ui/button'
import { Field, FieldGroup, FieldLabel, Textarea } from './ui/form-field'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { Alert, Badge, Empty, Spinner } from './ui/surfaces'
import { evaluate, type Check as RuleCheck, type Definition, type RecordData } from '@/kernel/definition'
import { money, request, shortId, type ActionResult, type BusinessRecord, type CapabilitySnapshot, type Snapshot } from '@/lib/client'
import { fieldLabel, idempotencyKey, pendingFor, statusLabel } from '@/lib/project-ui'
import { actionFormData, actionReferenceFields, relationshipSelection, validateRelationshipSelections } from '@/lib/relationship-selection'

export function ActionReviewTest({ snapshot, onChange, onLoadMore }: { snapshot: Snapshot; onChange: () => Promise<unknown>; onLoadMore: (slug: string) => Promise<void> }) {
  const [entity, setEntity] = useState(snapshot.capabilities[0]?.slug ?? '')
  const [recordId, setRecordId] = useState('')
  const [actionName, setActionName] = useState('')
  const [working, setWorking] = useState(false)
  const capability = snapshot.capabilities.find(item => item.slug === entity) ?? snapshot.capabilities[0]
  const records = snapshot.records.filter(record => record.capability === capability?.slug)
  const record = records.find(item => item.id === recordId) ?? records[0]
  const actions = capability?.definition.actions ?? []
  const action = actions.find(item => item.name === actionName) ?? actions.find(item => item.preconditions.every(rule => rule.field !== 'status' || rule.operator !== 'eq' || rule.value === record?.data.status)) ?? actions[0]
  const page = snapshot.recordPages?.[capability?.slug ?? '']
  useEffect(() => { if (!actionName && action) setActionName(action.name) }, [actionName, action?.name])

  return <section className="action-review-test" aria-labelledby="action-review-test-title">
    <header className="action-test-heading">
      <div><h2 id="action-review-test-title">Test action review</h2><p>See how a proposed action moves through your application’s rules and human review.</p></div>
      <Badge variant="warning"><FlaskConical aria-hidden="true" />Simulator</Badge>
    </header>
    <p className="action-test-boundary">Uses existing records. Previewing changes nothing; staging creates a real proposal. Records change only when you apply it.</p>
    <div className="action-test-layout">
      <fieldset className="action-test-selection" disabled={working}>
        <legend>Choose a scenario</legend>
        <FieldGroup>
          {snapshot.capabilities.length > 1 ? <Select label="Entity" value={capability?.slug ?? ''} onChange={value => { setEntity(value); setRecordId(''); setActionName('') }} options={snapshot.capabilities.map(item => ({ value: item.slug, label: item.definition.entity.label }))} /> : null}
          {records.length ? <Select label="Record" value={record?.id ?? ''} onChange={value => { setRecordId(value); setActionName('') }} options={records.map(item => ({ value: item.id, label: `${String(item.data.title)} · ${statusLabel(String(item.data.status))} · ${shortId(item.id)}` }))} /> : null}
          {page && page.loaded < page.total ? <Button variant="outline" onPress={() => onLoadMore(capability.slug)}>Load more records ({page.loaded} of {page.total})</Button> : null}
          {record && actions.length ? <Select label="Action" value={action?.name ?? ''} onChange={setActionName} options={actions.map(item => ({ value: item.name, label: item.label }))} /> : null}
        </FieldGroup>
        <p className="action-test-explanation">No AI model is called. This uses your session’s role, so it tests action rules and review, not an agent credential’s access.</p>
      </fieldset>
      {!record || !action || !capability ? <Empty title={!record ? 'Add a record to test review' : 'No actions to test'}><p>{!record ? 'Create a record in the application, then return here to preview an action.' : 'Define an action through Change application, then return here.'}</p></Empty> : <Scenario key={`${capability.slug}:${capability.version}:${record.id}:${record.version}:${action.name}`} snapshot={snapshot} capability={capability} record={record} actionName={action.name} onChange={onChange} onBusyChange={setWorking} />}
    </div>
  </section>
}

function failureMessage(check: RuleCheck, definition: Definition, actionName: string, record: RecordData) {
  const action = definition.actions.find(item => item.name === actionName)
  const rule = [...(action?.preconditions ?? []), ...(action?.policies ?? [])].find(item => item.id === check.id)
  if (!rule) return check.message
  const label = fieldLabel(rule.field, definition.entity.fields[rule.field]?.label ?? rule.field)
  const format = (value: unknown) => rule.field.endsWith('Cents') && typeof value === 'number' ? money(value) : typeof value === 'boolean' ? value ? 'Yes' : 'No' : rule.field === 'status' ? statusLabel(String(value)) : String(value ?? 'Not set')
  if (rule.operator === 'present') return `${label} is required.`
  const expected = rule.setting ? definition.settings[rule.setting] : rule.value
  return `${label} must be ${format(expected)}${rule.operator === 'lte' ? ' or less' : rule.operator === 'gte' ? ' or more' : ''}. Current value: ${format(record[rule.field])}.`
}

function Scenario({ snapshot, capability, record, actionName, onChange, onBusyChange }: { snapshot: Snapshot; capability: CapabilitySnapshot; record: BusinessRecord; actionName: string; onChange: () => Promise<unknown>; onBusyChange: (busy: boolean) => void }) {
  const { definition } = capability
  const action = definition.actions.find(item => item.name === actionName)!
  const [input, setInput] = useState<RecordData>(() => Object.fromEntries(Object.entries(action.input).flatMap(([key, field]) => {
    const target = Object.entries(action.effects).find(([, value]) => value === `$input.${key}`)?.[0]
    const current = target && definition.entity.fields[target]?.editable ? record.data[target] : undefined
    const value = current ?? field.default
    return value === undefined ? [] : [[key, value]]
  })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const keys = useRef(new Map<string, string>())
  const pending = pendingFor(snapshot, record.id)
  const [reviewOpen, setReviewOpen] = useState(false)
  const reviewPanel = useRef<HTMLDivElement>(null)
  useEffect(() => { if (reviewOpen && pending) reviewPanel.current?.focus() }, [reviewOpen, pending?.id])
  let preview: ReturnType<typeof evaluate> | undefined
  let inputError = ''
  try {
    preview = evaluate(definition, action.name, record.data, input, snapshot.principal.role === 'application' ? 'operator' : snapshot.principal.role)
    validateRelationshipSelections(definition.entity.fields, preview.after, snapshot.records)
  } catch (caught) { inputError = caught instanceof Error ? caught.message : 'Complete the action inputs.' }
  const changeFields = preview ? Object.fromEntries(Object.entries(definition.entity.fields).filter(([key]) => record.data[key] !== preview.after[key])) : {}
  const changedDefinition = { ...definition, entity: { ...definition.entity, fields: changeFields } }
  const update = (key: string, value: string | number | boolean | undefined) => {
    setInput(current => { const next = { ...current }; if (value === undefined) delete next[key]; else next[key] = value; return next })
    setError(''); setNotice('')
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); onBusyChange(true); setError(''); setNotice('')
    try { await work() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not complete this request. Try again.') } finally { setBusy(false); onBusyChange(false) }
  }
  async function stage() {
    if (!preview?.allowed || inputError) return
    const validInput = preview.input
    await run(async () => {
      const identity = JSON.stringify([record.id, record.version, capability.version, action.name, validInput])
      const result = await request<ActionResult>('/api/agent', { type: 'stage', recordId: record.id, action: action.name, input: validInput, idempotencyKey: idempotencyKey(keys.current, identity) })
      if (result.status === 'blocked') throw new Error(result.checks?.find(check => !check.passed)?.message || 'The rules blocked this proposal. Refresh the application and check the record.')
      if (!result.change) throw new Error('No proposal was returned. Refresh the application before trying again.')
      await onChange()
      keys.current.delete(identity)
      setReviewOpen(true)
      setNotice('Proposal staged. Review the changes below; the record has not changed.')
    })
  }
  async function review(decision: 'reject' | 'apply') {
    if (!pending) return
    await run(async () => {
      await request('/api/kernel', { type: 'review', changeId: pending.id, decision })
      setNotice(decision === 'reject' ? 'Proposal rejected. The record was not changed.' : 'Reviewed change applied. The execution is recorded in Activity.')
      toast.success(decision === 'reject' ? 'Proposal rejected. The record was not changed.' : 'Reviewed change applied. The execution is recorded in Activity.')
      setReviewOpen(false)
      await onChange()
    })
  }

  return <AssignmentMembers value={snapshot.members ?? []}><div className="action-test-scenario" aria-busy={busy}>
    <ol className="action-test-steps" aria-label="Review flow"><li><Check aria-hidden="true" />Choose action</li><li aria-current={reviewOpen && pending ? undefined : 'step'}>Preview changes</li><li aria-current={reviewOpen && pending ? 'step' : undefined}>Human review</li></ol>
    <div role="status" aria-live="polite">{notice ? <Alert>{notice}</Alert> : null}</div>
    {error ? <Alert variant="danger">{error}</Alert> : null}
    {reviewOpen && pending ? <div ref={reviewPanel} tabIndex={-1} className="action-test-review" aria-label="Staged proposal review">
      <PendingApply record={record} proposal={pending} definition={definition} definitionVersion={capability.version} records={snapshot.records} busy={busy} canReview={snapshot.principal.role === 'owner'} onReject={() => void review('reject')} onApply={() => void review('apply')} />
      <Button variant="ghost" disabled={busy} onPress={() => setReviewOpen(false)}>Back to preview</Button>
    </div> : <>
      <header className="action-test-preview-heading"><div><h3>{action.label}</h3><p>{action.description}</p></div><Badge variant="neutral">Preview only</Badge></header>
      {Object.keys(action.input).length ? <fieldset className="action-test-inputs" disabled={busy}><legend>Action inputs</legend><FieldGroup>{Object.entries(action.input).map(([key, field]) => {
        const label = `${key.endsWith('Cents') ? `${field.label} (USD)` : field.label}${field.required ? ' (required)' : ''}`
        if (field.reference) {
          const constraints = actionReferenceFields(definition, action, key)
          const selection = relationshipSelection(field, constraints.length ? constraints : [field], definition.entity.fields, actionFormData(action, record.data, input), snapshot.records, String(input[key] ?? ''))
          return <Select key={key} label={label} value={String(input[key] ?? '')} onChange={value => update(key, value || undefined)} {...selection} />
        }
        if (field.type === 'enum' || field.type === 'boolean' || field.format === 'user') {
          const options = field.format === 'user' ? (snapshot.members ?? []).map(member => ({ value: member.id, label: member.name })) : field.type === 'boolean' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : (field.options ?? []).map(value => ({ value, label: value }))
          return <Select key={key} label={label} value={String(input[key] ?? '')} onChange={value => update(key, value === '' ? undefined : field.type === 'boolean' ? value === 'true' : value)} options={[{ value: '', label: 'Choose a value' }, ...options]} />
        }
        const monetary = field.type === 'integer' && key.endsWith('Cents')
        return <Field key={key} value={input[key] === undefined ? '' : String(monetary ? Number(input[key]) / 100 : input[key])} onChange={value => update(key, value === '' ? undefined : field.type === 'integer' ? (monetary ? Math.round(Number(value) * 100) : Number(value)) : value)} type={field.type === 'integer' ? 'number' : 'text'} isDisabled={busy}><FieldLabel>{label}</FieldLabel>{field.type === 'string' && (field.max ?? 0) > 200 ? <Textarea /> : <Input type={field.format === 'date' ? 'date' : undefined} step={monetary ? 0.01 : field.type === 'integer' ? 1 : undefined} min={monetary && field.min !== undefined ? field.min / 100 : field.min} max={monetary && field.max !== undefined ? field.max / 100 : field.max} />}</Field>
      })}</FieldGroup></fieldset> : null}
      {inputError ? <p className="action-test-input-help">{inputError}</p> : null}
      {preview && !inputError ? <>
        {Object.keys(changeFields).length ? <div className="action-test-diff"><div><h4>Current record</h4><RecordFields definition={changedDefinition} data={record.data} records={snapshot.records} showEmpty /></div><ArrowRight aria-hidden="true" /><div><h4>Proposed changes</h4><RecordFields definition={changedDefinition} data={preview.after} records={snapshot.records} showEmpty /></div></div> : <p className="muted">This action does not change any field values.</p>}
        <section className="action-test-checks" aria-label="Action checks"><h4>Rule checks <span>{preview.checks.filter(check => check.passed).length} of {preview.checks.length} passed</span></h4>{preview.checks.map(check => <div className="check" key={check.id}><span><strong>{check.label}</strong>{!check.passed ? <span>{failureMessage(check, definition, action.name, record.data)}</span> : null}</span><Badge variant={check.passed ? 'success' : 'danger'}>{check.passed ? 'Passed' : 'Blocked'}</Badge></div>)}</section>
      </> : null}
      <footer className="action-test-footer">
        {pending ? <><p>This record already has a pending proposal. Review it before staging another.</p><Button disabled={busy} onPress={() => setReviewOpen(true)}>Review existing proposal<ArrowRight data-icon="inline-end" /></Button></> : <><p>Staging saves a proposal for human review. It does not apply the action.</p><Button disabled={busy || !preview?.allowed || Boolean(inputError)} onPress={() => void stage()}>{busy ? <Spinner data-icon="inline-start" /> : null}{busy ? 'Staging proposal…' : 'Stage proposal for review'}{!busy ? <ArrowRight data-icon="inline-end" /> : null}</Button></>}
      </footer>
    </>}
  </div></AssignmentMembers>
}
