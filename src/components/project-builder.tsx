import { BuilderQuestions } from './builder-questions'
import { clarifiedBrief, type BuilderClarification } from '@/kernel/builder-clarification'
import { ApplicationLayoutEditor } from './application-layout-editor'
import { RecordDetail } from './record-detail'
import { ApplicationViewEditor } from './application-view-editor'
import { applicationPresentation, matchesView, sortViewRecords } from '@/kernel/application-views'
import { ApplicationFieldEditor } from './application-field-editor'
import { MigrationReview } from './migration-review'
import type { MigrationPreview } from '@/kernel/migration'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBlocker, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Plus } from 'lucide-react'
import { ActionDialog, CreateEntityDialog } from './kernel-dialogs'
import { Dialog } from './ui/dialog'
import { money } from '@/lib/client'
import { Button } from './ui/button'
import { Field, FieldGroup, FieldLabel, Textarea } from './ui/form-field'
import { Input } from './ui/input'
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Spinner, ToggleGroup } from './ui/surfaces'
import { sampleData, type Application, type Draft } from '@/kernel/application'
import { evaluate, validateFields } from '@/kernel/definition'
import { request as defaultRequest, type BusinessRecord } from '@/lib/client'

export function ProjectBuilder({ draft: initial, model, onSaved, onClose, send = defaultRequest, planned = false, onStateChange, conversation, publicationBlocked = false }: {
  conversation?: ReactNode
  publicationBlocked?: boolean
  onStateChange?: (state: { dirty: boolean; busy: boolean }) => void
  planned?: boolean
  send?: typeof defaultRequest
  draft?: Draft
  model: { configured: boolean; model: string | null }
  onSaved: (draft: Draft) => void
  onClose: () => void
}) {
  const request = send
  const navigate = useNavigate()
  const [draft, setDraft] = useState(initial)
  const [brief, setBrief] = useState(initial?.brief ?? '')
  const [definition, setDefinition] = useState<Application | undefined>(initial?.definition)
  const [previewView, setPreviewView] = useState<string | null>(initial?.definition.startView ?? null)
  const [active, setActive] = useState(initial?.definition.entities[0]?.slug ?? '')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [pendingRequest, setPendingRequest] = useState<'clarify' | 'build'>()
  const hasPendingRequest = Boolean(pendingRequest)
  const [clarification, setClarification] = useState<BuilderClarification>()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [migration, setMigration] = useState<MigrationPreview>()
  const [previewResult, setPreviewResult] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [action, setAction] = useState<string>()
  const [samples, setSamples] = useState<BusinessRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const view = definition?.views?.find(view => view.id === previewView)
  const entity = definition?.entities.find(e => e.slug === (view?.entity ?? active)) ?? definition?.entities[0]
  const records = sortViewRecords(samples.filter(r => r.capability === entity?.slug && matchesView(r.data, view)), view?.sort ?? { field: '$createdAt', direction: 'desc' })
  const previewColumns = view?.columns.length ? ['title', ...view.columns.filter(key => key !== 'title')] : ['title', 'status']
  const selected = records.find(r => r.id === selectedId) ?? records[0]
  const dirty = hasPendingRequest || Boolean(clarification) || (draft ? JSON.stringify(draft.definition) !== JSON.stringify(definition) || brief !== draft.brief : Boolean(brief.trim()))
  useEffect(() => { onStateChange?.({ dirty, busy: Boolean(busy) }) }, [dirty, busy, onStateChange])
  const allowNavigation = useRef(false)
  const blocker = useBlocker({ shouldBlockFn: () => dirty && !allowNavigation.current, enableBeforeUnload: () => dirty && !allowNavigation.current, withResolver: true })
  const previewSchema = JSON.stringify(definition?.entities.map(e => ({ slug: e.slug, entity: e.entity })))
  const previousSchema = useRef(previewSchema)

  useEffect(() => {
    const reset = previousSchema.current !== previewSchema && samples.length > 0
    previousSchema.current = previewSchema
    setSamples((definition?.entities ?? []).map(e => ({ id: `preview-${e.slug}`, capability: e.slug, entity: e.entity.name, data: { ...sampleData(e.entity.fields), ...Object.fromEntries(Object.entries(e.entity.fields).filter(([, f]) => f.reference).map(([key, f]) => [key, `preview-${f.reference}`])) }, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })))
    setPreviewResult(reset ? 'The fields changed, so example records were reset to match the new definition.' : '')
  }, [previewSchema])

  async function run(label: string, work: () => Promise<void>) {
    if (busy) return
    setBusy(label); setError('')
    try { await work() } catch (e) { setError(e instanceof Error ? e.message : 'Unable to complete the request.') } finally { setBusy('') }
  }
  function accept(next: Draft) {
    setMigration(undefined)
    setClarification(undefined); setAnswers({}); setPendingRequest(undefined)
    setDraft(next); setDefinition(next.definition); setBrief(next.brief); setActive(next.definition.entities[0].slug); setPreviewView(next.definition.startView); onSaved(next)
  }
  async function build(inputBrief: string) {
    setBrief(inputBrief); setClarification(undefined); setAnswers({}); setPendingRequest('build')
    accept(await request<Draft>('/api/kernel', { type: 'build', brief: inputBrief, ...(draft ? { id: draft.id, expectedVersion: draft.version } : {}) }))
  }
  async function prepare() {
    if (pendingRequest === 'build') { await build(brief); return }
    setPendingRequest('clarify')
    let current = draft
    if (draft && definition && JSON.stringify(definition) !== JSON.stringify(draft.definition)) {
      current = await request<Draft>('/api/kernel', { type: 'save_draft', id: draft.id, expectedVersion: draft.version, brief: draft.brief, definition })
      setDraft(current); onSaved(current)
    }
    const plan = await request<BuilderClarification>('/api/kernel', { type: 'clarify', brief, ...(current ? { id: current.id, expectedVersion: current.version } : {}) })
    if (plan.questions.length) { setClarification(plan); setAnswers({}) }
    else {
      setPendingRequest('build'); setBusy('Building draft…')
      accept(await request<Draft>('/api/kernel', { type: 'build', brief, ...(current ? { id: current.id, expectedVersion: current.version } : {}) }))
    }
  }
  async function save() {
    if (!draft || !definition) throw new Error('Create a draft first.')
    if (!dirty) return draft
    const next = await request<Draft>('/api/kernel', { type: 'save_draft', id: draft.id, expectedVersion: draft.version, brief, definition })
    accept(next)
    return next
  }

  const publicationReview = definition ? <>
            <Field value={definition.name} isDisabled={Boolean(busy) || Boolean(clarification) || hasPendingRequest} maxLength={80} onChange={name => setDefinition({ ...definition, name })}><FieldLabel>Project name</FieldLabel><Input /></Field>
            <Badge variant="warning">{draft?.baseProjectVersion ? `Changes to application v${draft.baseProjectVersion}` : draft?.source === 'example' ? 'Example draft' : 'Draft'} · draft {draft?.version}</Badge>
            <h3>Review before publishing</h3>
            <ul className="builder-assumptions">{definition.assumptions.map((item, i) => <li key={i}>{item}</li>)}</ul>
            <p className="muted">Owner and operator roles can propose actions. Owners review changes. {draft?.baseProjectVersion ? 'Publishing updates your application and preserves existing records. Preview the migration before publishing.' : 'Publishing creates an empty application; preview records stay here.'}</p>
            <div className="actions">
              <Button variant="outline" disabled={!dirty || Boolean(busy) || Boolean(clarification) || hasPendingRequest} onPress={() => run('Saving draft…', async () => { await save() })}>Save draft</Button>
              {draft?.baseProjectVersion ? <Button variant="outline" disabled={Boolean(busy) || Boolean(clarification) || hasPendingRequest} onPress={() => run('Checking live records…', async () => {
                const saved = await save()
                setMigration(await request<MigrationPreview>('/api/kernel', { type: 'preview_migration', id: saved.id, expectedVersion: saved.version }))
              })}>{busy === 'Checking live records…' ? <Spinner data-icon="inline-start" /> : null}Preview changes</Button> : null}
              <Button disabled={publicationBlocked || Boolean(busy) || Boolean(clarification) || hasPendingRequest || Boolean(draft?.baseProjectVersion && (dirty || !migration?.report.canPublish || migration.draftVersion !== draft.version))} onPress={() => run('Publishing…', async () => {
                const saved = await save()
                const result = await request<{ slug: string }>('/api/kernel', { type: 'publish_draft', id: saved.id, expectedVersion: saved.version, ...(migration ? { previewToken: migration.token } : {}) })
                allowNavigation.current = true
                await navigate({ to: '/p/$projectSlug', params: { projectSlug: result.slug } })
              })}>{busy === 'Publishing…' ? <Spinner data-icon="inline-start" /> : null}{draft?.baseProjectVersion ? `Publish version ${draft.baseProjectVersion + 1}` : 'Publish application'}</Button>
            </div>
            {migration ? <MigrationReview preview={migration} stale={dirty || migration.draftVersion !== draft?.version} /> : null}
            {dirty ? <p className="muted">{clarification ? 'Answer the questions or return to edit the description.' : hasPendingRequest ? 'This request is not in the saved definition. Retry the agent or discard changes before publishing.' : 'Unsaved changes. Save the draft before closing.'}</p> : <p className="muted">Draft saved. You can close it and return later.</p>}
          </> : null

  return (
    <section className={conversation ? "project-builder builder-with-conversation" : "project-builder"} aria-label="Create a business application">
      <div className="builder-heading" hidden={Boolean(conversation)}>
        <div><h2>{draft?.baseProjectVersion ? 'Review application changes' : draft ? 'Review your application' : 'What does your business need?'}</h2><p className="muted">Describe the work. Refine the preview. Publish when it fits.</p></div>
        <div className="actions">{dirty ? <Button variant="outline" disabled={Boolean(busy)} onPress={() => {
          setDefinition(draft?.definition); setBrief(draft?.brief ?? ''); setClarification(undefined); setAnswers({}); setPendingRequest(undefined); setError(''); onClose()
        }}>Discard changes</Button> : null}<Button variant="ghost" disabled={Boolean(busy) || dirty} onPress={onClose}>Close</Button></div>
      </div>
      <div className="builder-layout">
        <div className="stack builder-form">
          {conversation}
          <div hidden={planned}><FieldGroup>
            <Field value={brief} onChange={value => { setBrief(value); setClarification(undefined); setAnswers({}); setPendingRequest(current => current ? 'clarify' : undefined) }} isDisabled={Boolean(busy) || Boolean(clarification)} maxLength={4000}>
              <FieldLabel>{draft ? 'Describe the application or a change' : 'Business description'}</FieldLabel>
              <Textarea className="builder-brief" aria-describedby="builder-brief-help" placeholder="We need a purchasing app. Track suppliers and requests, with owner approval before a purchase is approved." />
            </Field>
            <div className="builder-brief-meta"><p id="builder-brief-help">Include what you track, who uses it, and what needs approval.</p><span>{brief.length.toLocaleString()} / 4,000</span></div>
            <p className="muted builder-model">{model.configured ? `Live builder · ${model.model}. Your description is sent to the connected model.` : draft ? 'Live builder not connected. You can edit this draft and test its preview.' : 'Live builder not connected. Try the editable purchasing example below.'}</p>
            <div className="actions">
              <Button disabled={!model.configured || brief.trim().length < 10 || Boolean(busy) || Boolean(clarification)} onPress={() => run(pendingRequest === 'build' ? 'Building draft…' : 'Understanding request…', prepare)}>{busy === 'Understanding request…' || busy === 'Building draft…' ? <Spinner data-icon="inline-start" /> : null}{busy === 'Understanding request…' || busy === 'Building draft…' ? busy : pendingRequest === 'clarify' ? 'Retry request' : hasPendingRequest ? 'Retry build' : draft ? 'Revise with agent' : 'Build with agent'}{!busy ? <ArrowRight data-icon="inline-end" /> : null}</Button>
              {!draft ? <Button variant="outline" disabled={Boolean(busy)} onPress={() => run('Loading example…', async () => accept(await request<Draft>('/api/kernel', { type: 'example' })))}>{busy === 'Loading example…' ? <Spinner data-icon="inline-start" /> : null}{busy === 'Loading example…' ? busy : 'Try purchasing example'}</Button> : null}
            </div>
          </FieldGroup></div>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {clarification ? <BuilderQuestions plan={clarification} answers={answers} onAnswer={(id, answer) => setAnswers(current => ({ ...current, [id]: answer }))} busy={Boolean(busy)} onBack={() => { setClarification(undefined); setAnswers({}) }} onBuild={() => run('Building draft…', async () => { const next = clarifiedBrief(brief, clarification, answers); await build(next) })} onAssumptions={() => run('Building draft…', async () => { const next = clarifiedBrief(brief, clarification, answers, true); await build(next) })} /> : null}
          {conversation ? <Dialog open={publishOpen} onOpenChange={setPublishOpen} title="Publish your application?" description="Review what will go live before publishing."><div className="stack">{publicationReview}</div></Dialog> : publicationReview}
          {busy && definition ? <p className="builder-status" role="status"><Spinner /> {busy}</p> : null}
        </div>
        {entity && definition ? <div className="stack builder-preview">
          <div className="builder-heading"><div><h3>{definition.name}</h3><Badge variant="warning">Interactive preview · example data</Badge></div>{conversation ? <div className="actions">{dirty ? <Button variant="ghost" disabled={Boolean(busy)} onPress={() => { setDefinition(draft?.definition); setBrief(draft?.brief ?? ''); setClarification(undefined); setAnswers({}); setPendingRequest(undefined); setError('') }}>Discard preview edits</Button> : null}<Button variant="outline" disabled={!dirty || Boolean(busy) || Boolean(clarification) || hasPendingRequest} onPress={() => run('Saving draft…', async () => { await save() })}>Save draft</Button><Button disabled={publicationBlocked || Boolean(busy)} onPress={() => setPublishOpen(true)}>Publish</Button></div> : null}</div>
          <ToggleGroup label="Preview entity" value={entity.slug} onChange={value => { setActive(value); setPreviewView(null); setSelectedId('') }} options={applicationPresentation(definition).navigation.map(item => ({ value: item.entity, label: item.label }))} />
          {definition.views?.some(view => view.entity === entity.slug) ? <ToggleGroup label="Preview saved view" value={view?.id ?? 'all'} onChange={value => { setPreviewView(value === 'all' ? null : value); setSelectedId('') }} options={[{ value: 'all', label: 'All records' }, ...definition.views.filter(view => view.entity === entity.slug).map(view => ({ value: view.id, label: view.name }))]} /> : null}
          <Card>
            <CardHeader><CardTitle>{entity.entity.label}</CardTitle><CardDescription>{entity.description}</CardDescription></CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onPress={() => setCreateOpen(true)}><Plus data-icon="inline-start" />Try new {entity.entity.label.toLowerCase()}</Button>
              {records.length ? <div className="table-scroll"><table className="data-table"><thead><tr>{previewColumns.map(key => <th key={key}>{entity.entity.fields[key]?.label}</th>)}</tr></thead><tbody>{records.map(record => <tr key={record.id} aria-selected={selected?.id === record.id}>{previewColumns.map(key => <td key={key}>{key === 'title' ? <Button variant="link" onPress={() => setSelectedId(record.id)}>{String(record.data.title)}</Button> : entity.entity.fields[key]?.reference ? String(samples.find(sample => sample.id === record.data[key])?.data.title ?? '—') : key.endsWith('Cents') ? money(record.data[key]) : String(record.data[key] ?? '—')}</td>)}</tr>)}</tbody></table></div> : <Empty title="No example records match this view.">Choose All records or create a matching example to test this view.</Empty>}
              {selected ? <RecordDetail key={selected.id} definition={entity} data={selected.data} records={samples} layout={definition.layouts.find(layout => layout.entity === entity.slug)} /> : null}
              <div className="actions">{entity.actions.map(item => <Button key={item.name} disabled={!selected} variant="outline" size="sm" onPress={() => setAction(item.name)}>Try {item.label.toLowerCase()}</Button>)}</div>
              {previewResult ? <Alert>{previewResult}</Alert> : null}
            </CardContent>
          </Card>
          <details className="builder-definition"><summary>Customize record layouts</summary><ApplicationLayoutEditor entityId={entity.slug} onEntityChange={value => { setActive(value); setPreviewView(null); setSelectedId('') }} application={definition} disabled={Boolean(busy) || Boolean(clarification) || hasPendingRequest} onChange={setDefinition} /></details>
          <details className="builder-definition"><summary>Customize navigation and views</summary><ApplicationViewEditor application={definition} disabled={Boolean(busy) || Boolean(clarification) || hasPendingRequest} onChange={setDefinition} /></details>
          <details className="builder-definition"><summary>Fields, actions and rules</summary><div className="stack"><h3>Fields and relationships</h3>
          <ApplicationFieldEditor key={entity.slug} application={definition} entitySlug={entity.slug} disabled={Boolean(busy) || Boolean(clarification) || hasPendingRequest} onChange={setDefinition} />
          <dl className="kv">{Object.entries(entity.entity.fields).map(([key, field]) => <div className="builder-field" key={key}><dt>{field.label}</dt><dd>{field.reference ? `Links to ${definition.entities.find(e => e.slug === field.reference)?.name}` : field.type}{field.required ? ' · required' : ''}{!field.editable ? ' · set by actions' : ''}</dd></div>)}</dl>
          <h3>Actions and rules</h3>
          {entity.actions.map(item => <div key={item.name} className="builder-rule"><strong>{item.label}</strong><p>{item.description}</p><ul>{[...item.preconditions, ...item.policies].map(rule => <li key={rule.id}>{rule.label}: {rule.field.endsWith('Cents') ? 'Amount' : entity.entity.fields[rule.field]?.label} {rule.operator === 'lte' ? '≤' : '='} {rule.field.endsWith('Cents') ? money(rule.setting ? entity.settings[rule.setting] : rule.value) : String(rule.setting ? entity.settings[rule.setting] : rule.value)}</li>)}</ul></div>)}
          {Object.keys(entity.settings).length ? <FieldGroup>{Object.entries(entity.settings).filter(([, value]) => typeof value === 'number').map(([key, value]) => <Field key={key} type="number" value={String(key.endsWith('Cents') ? Number(value) / 100 : value)} isDisabled={Boolean(busy)} onChange={next => setDefinition({ ...definition, entities: definition.entities.map(e => e.slug === entity.slug ? { ...e, settings: { ...e.settings, [key]: key.endsWith('Cents') ? Math.round(Number(next) * 100) : Number(next) } } : e) })}><FieldLabel>{key === 'approvalLimitCents' ? 'Approval ceiling (USD)' : key}</FieldLabel><Input step={key.endsWith('Cents') ? '0.01' : '1'} /></Field>)}</FieldGroup> : null}</div></details>
        </div> : <div className="builder-preview builder-preview-pending">
          <h3>Application preview</h3>
          <div className="builder-preview-state" role="status" aria-live="polite">
            {busy ? <><Spinner /><h3>{busy}</h3><p>Your preview will appear here when the draft is ready.</p></> : clarification ? <Empty title="A few details to shape your application">Answer the questions to build a preview, or continue with the suggested assumptions.</Empty> : error ? <Empty title="Your preview is not ready yet">Your description is still here. Retry the request or edit it before trying again.</Empty> : <Empty title="Your application preview will appear here.">Kernel proposes the records, relationships, and actions your team needs.</Empty>}
          </div>
        </div>}
      </div>
      <Dialog open={blocker.status === 'blocked'} onOpenChange={open => { if (!open) blocker.reset?.() }} title="Keep your unsaved work?" description="Your latest edits have not been saved. Stay to save them, or leave and discard only the unsaved edits.">
        <div className="actions"><Button onPress={() => blocker.reset?.()}>Keep editing</Button><Button variant="outline" onPress={() => blocker.proceed?.()}>Leave without saving</Button></div>
      </Dialog>
      {entity ? <>
        <CreateEntityDialog error={error} open={createOpen} definition={entity} records={samples} busy={false} onOpenChange={setCreateOpen} onCreate={data => {
          try {
            const valid = validateFields(entity.entity.fields, data, true)
            const record = { id: crypto.randomUUID(), capability: entity.slug, entity: entity.entity.name, data: valid, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            setSamples(current => [...current, record]); setSelectedId(record.id); setCreateOpen(false); setError('')
          } catch (e) { setError(e instanceof Error ? e.message : 'Check the preview fields.') }
        }} />
        <ActionDialog error={error} previewOnly open={Boolean(action)} actionName={action} record={selected} definition={entity} records={samples} role="owner" busy={false} onOpenChange={open => { if (!open) setAction(undefined) }} onSubmit={(name, input) => {
          if (!selected) return
          try {
            const result = evaluate(entity, name, selected.data, input, 'owner')
            if (result.allowed) setSamples(current => current.map(r => r.id === selected.id ? { ...r, data: result.after } : r))
            setPreviewResult(result.allowed ? 'Preview passed. The example record changed here. In the live application, an owner must review and apply this proposal.' : `Blocked: ${result.checks.filter(c => !c.passed).map(c => c.message).join('; ')}`)
            setAction(undefined)
          } catch (e) { setPreviewResult(e instanceof Error ? e.message : 'Check the action input.'); setAction(undefined) }
        }} />
      </> : null}
    </section>
  )
}
