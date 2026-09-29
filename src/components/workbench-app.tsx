import { ExportRecords } from './export-records'
import { AssignmentMembers, memberLabel, useViewClock } from './record-context'
import { ApplicationAssistant } from './application-assistant'
import { RecordBoard } from './record-board'
import { RelatedRecords } from './related-records'
import { RecordDetail } from './record-detail'
import { RecordOverview } from './record-overview'
import { matchesView, relativeDate, sortViewRecords, type SavedView } from '@/kernel/application-views'
import { resolveViewGrammar } from '@/kernel/grammars'
import { appShellForPattern } from '@/kernel/patterns'
import { snapshotRecordLimits } from '@/kernel/record-operations'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { Plus, Sparkles, ArrowDownWideNarrow, Search, ChevronRight, Clock3 } from 'lucide-react'
import { Toaster } from 'sonner'
import { ActionDialog, CreateEntityDialog, PendingApply } from '@/components/kernel-dialogs'
import { LoadingShell, ProjectFrame } from '@/components/project-frame'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Separator, Spinner, ToggleGroup } from '@/components/ui/surfaces'
import type { Definition, Field as EntityField, RecordData } from '@/kernel/definition'
import { date, shortId, money, request, type ActionResult, type BusinessRecord, type CapabilitySnapshot } from '@/lib/client'
import { actionAvailable, capabilityOf, idempotencyKey, pendingFor, statusLabel, statusVariant } from '@/lib/project-ui'
import { useProject } from '@/lib/use-project'

const destructive = new Set(['lose', 'retire', 'offboard', 'decline', 'cancel'])

function plural(label: string) {
  if (label.endsWith('s')) return label
  return `${label}s`
}

function extraColumns(definition: Definition) {
  return Object.entries(definition.entity.fields).filter(([key, field]) => {
    if (key === 'title' || key === 'status') return false
    if (field.type === 'string' && (field.max ?? 0) > 200) return false
    return true
  }).slice(0, 2)
}

function cell(key: string, field: EntityField, data: RecordData) {
  const value = data[key]
  if (value === undefined || value === '') return '—'
  if (key === 'amountCents' || (field.type === 'integer' && key.endsWith('Cents'))) return money(value)
  if (field.type === 'boolean') return value ? 'Yes' : 'No'
  if (field.format === 'percent') return `${value}%`
  return String(value)
}

function viewDate(offset: number, timeZone: string | undefined, now: Date) {
  const day = relativeDate(offset, timeZone, now)
  return day ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)) : 'today'
}

function viewRule(filter: SavedView['filters'][number], definition: Definition, view: SavedView, now: Date) {
  const label = filter.field === '$updatedAt' ? 'Last updated' : definition.entity.fields[filter.field]?.label ?? filter.field
  if (filter.operator === 'is_me') return `${label}: you`
  if (filter.operator === 'empty') return `${label} is not set`
  if (filter.operator === 'date_on' || filter.operator === 'date_before') {
    const date = viewDate(Number(filter.value), view.timeZone, now)
    return `${label}: ${filter.operator === 'date_before' ? 'before ' : ''}${date} (${view.timeZone ?? 'UTC'})`
  }
  const value = filter.field === 'status' ? statusLabel(String(filter.value)) : String(filter.value)
  if (filter.operator === 'eq') return `${label}: ${value}`
  if (filter.operator === 'neq') return `${label} is not ${value}`
  return `${label} ${filter.operator === 'lte' ? 'at most' : 'at least'} ${value}`
}

function viewRules(view: SavedView, definition: Definition, now: Date) {
  const excludedStages = view.filters.filter(filter => filter.field === 'status' && filter.operator === 'neq')
  const otherRules = view.filters.filter(filter => !(filter.field === 'status' && filter.operator === 'neq'))
  const summary = [
    ...otherRules.map(filter => viewRule(filter, definition, view, now)),
    ...(excludedStages.length ? [`Excludes ${excludedStages.map(filter => statusLabel(String(filter.value))).join(', ')}`] : []),
  ]
  return { summary: summary.join(' · ') || 'No filters', details: view.filters.map(filter => viewRule(filter, definition, view, now)) }
}

export function WorkbenchApp({ projectSlug }: { projectSlug: string }) {
  const { session, snapshot, error, setError, busy, run, refresh, loadMore, keys } = useProject(projectSlug)
  const now = useViewClock()
  const [entitySlug, setEntitySlug] = useState<string>()
  const [agentOpen, setAgentOpen] = useState(false)
  const [detailTab, setDetailTab] = useState('details')
  const [sort, setSort] = useState<'newest' | 'name'>()
  const [viewId, setViewId] = useState<string | null>()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [relatedCreation, setRelatedCreation] = useState<{ capability: CapabilitySnapshot; references: Record<string, string> }>()
  const [actionName, setActionName] = useState<string>()
  const [actionContext, setActionContext] = useState<{ record: BusinessRecord; definitionVersion: number }>()

  const savedViews = snapshot?.project?.presentation?.views ?? []
  const view = savedViews.find(item => item.id === (viewId === undefined ? snapshot?.project?.presentation?.startView : viewId))
  const viewSort = sort ? { field: sort === 'name' ? 'title' : '$createdAt', direction: sort === 'name' ? 'asc' as const : 'desc' as const } : view?.sort ?? { field: '$createdAt', direction: 'desc' as const }
  const capability = snapshot
    ? (snapshot.project ? capabilityOf(snapshot, view?.entity ?? entitySlug ?? snapshot.project.presentation?.navigation[0]?.entity ?? snapshot.project.packages[0] ?? '') : undefined) ?? snapshot.capability
    : undefined
  const definition = capability?.definition
  const records = useMemo(() => {
    if (!snapshot || !definition) return []
    const needle = query.trim().toLowerCase()
    return sortViewRecords(snapshot.records.filter(record => {
      if (record.capability !== definition.slug) return false
      const pending = pendingFor(snapshot, record.id)
      const matchesStatus = status === 'all' || (status === 'pending' ? Boolean(pending) : record.data.status === status)
      const haystack = Object.values(record.data).join(' ').toLowerCase()
      return matchesView(record.data, view, { userId: snapshot.principal.userId, now, updatedAt: record.updatedAt }) && matchesStatus && (!needle || haystack.includes(needle))
    }), viewSort)
  }, [definition, query, snapshot, status, sort, view, now])

  useEffect(() => {
    if (records.length === 0) {
      setSelectedId(current => current === undefined ? current : undefined)
      return
    }
    if (!records.some(record => record.id === selectedId)) setSelectedId(records[0].id)
  }, [records, selectedId])

  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot || !definition) {
    return error
      ? <main className="auth-page"><Alert variant="danger">{error}</Alert><p><Link to="/workspace">Back to projects</Link></p></main>
      : <LoadingShell />
  }

  const canCreate = ['owner', 'operator', 'application'].includes(snapshot.principal.role)
  const creationDefinition = relatedCreation?.capability.definition ?? definition
  const selected = records.find(record => record.id === selectedId)
  const pending = selected ? pendingFor(snapshot, selected.id) : undefined
  const selectedActions = selected
    ? definition.actions.filter(action => !pending && actionAvailable(definition, selected, action.name, snapshot.principal.role))
    : []
  const creations = snapshot.changes.filter(change => change.kind === 'create' && change.status === 'pending' && change.capability === definition.slug)
  const pendingCount = snapshot.changes.filter(change => change.capability === definition.slug && change.status === 'pending' && snapshot.records.some(record => record.id === change.recordId && matchesView(record.data, view, { userId: snapshot.principal.userId, now, updatedAt: record.updatedAt }))).length
  const canReview = definition.reviewerRoles.includes(snapshot.principal.role)
  const columns = view?.columns.length ? view.columns.filter(key => key !== 'title' && key !== 'status').map(key => [key, definition.entity.fields[key]] as [string, EntityField]) : extraColumns(definition)
  const showStatus = !view?.columns.length || view.columns.includes('status')
  const chooseView = (id: string | null) => { setViewId(id); setSort(undefined); setStatus('all'); setQuery(''); setSelectedId(undefined); setAgentOpen(false) }
  const statuses = definition.entity.fields.status?.options ?? []
  const noun = definition.entity.label.toLowerCase()
  const nouns = plural(noun)
  const entityRecords = snapshot.records.filter(record => record.capability === definition.slug)
  const page = snapshot.recordPages?.[definition.slug]
  const viewRecords = entityRecords.filter(record => matchesView(record.data, view, { userId: snapshot.principal.userId, now, updatedAt: record.updatedAt }))
  const statusCounts = new Map(statuses.map(value => [value, viewRecords.filter(record => record.data.status === value).length]))
  const rules = view ? viewRules(view, definition, now) : undefined
  const followUpToday = view?.filters.some(filter => filter.field === 'followUpDate' && filter.operator === 'date_on' && Number(filter.value) === 0)
  const nextStepView = savedViews.find(item => item.entity === definition.slug && item.id !== view?.id && item.filters.some(filter => filter.field === 'nextStep' && filter.operator === 'empty'))
  const nextStepCount = nextStepView ? entityRecords.filter(record => matchesView(record.data, nextStepView, { userId: snapshot.principal.userId, now, updatedAt: record.updatedAt })).length : 0
  const grammar = view ? resolveViewGrammar(view) : 'ledger'
  const shell = appShellForPattern(snapshot.project?.pattern)
  const inbox = shell === 'inbox'
  const overview = !inbox && grammar === 'overview'
  const board = !inbox && grammar === 'board' && shell !== 'ledger'
  const showInspector = agentOpen || (Boolean(selected) && !(shell === 'dashboard' && overview))

  return (
    <AssignmentMembers.Provider value={snapshot.members ?? []}>
      <Toaster position="top-right" />
      <ProjectFrame snapshot={snapshot} activeEntity={definition.slug} activeView={view?.id} onViewChange={chooseView} reviewing={status === 'pending'} onEntityChange={value => { setEntitySlug(value); setViewId(null); setSort(undefined); setStatus('all'); setQuery(''); setSelectedId(undefined); setActionName(undefined); setAgentOpen(false) }} onReview={() => { setEntitySlug(definition.slug); setViewId(null); setStatus('pending'); setQuery(''); setAgentOpen(false) }}>
        <main className="main desk-main" id="main-content" tabIndex={-1}>
          <header className="main-header">
            <div>
              <h1>{view?.name ?? plural(definition.entity.label)}</h1>
              {!view ? <p>{snapshot.project?.description ?? definition.description}</p> : null}
            </div>
            <div className="desk-header-actions flex-wrap">{records.length ? <ExportRecords definition={definition} records={records} related={snapshot.records} name={`${snapshot.project?.name ?? definition.name}-${view?.name ?? definition.name}`} /> : null}<Button variant="outline" aria-pressed={agentOpen} onPress={() => setAgentOpen(!agentOpen)}><Sparkles data-icon="inline-start" />Assistant</Button><Button disabled={!canCreate || busy} onPress={() => { setRelatedCreation(undefined); setError(''); setCreateOpen(true) }}><Plus data-icon="inline-start" />New {noun}</Button></div>
          </header>
          <div className="main-body">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            {creations.length ? <section aria-label="Proposed new records"><h2>New records awaiting review · {creations.length}</h2>{creations.map(proposal => <PendingApply key={proposal.id} proposal={proposal} definition={definition} definitionVersion={capability?.version} records={snapshot.records} busy={busy} canReview={canReview}
              onReject={() => run('Proposal rejected.', async () => { await request('/api/kernel', { type: 'review', changeId: proposal.id, decision: 'reject' }); await refresh() })}
              onApply={() => run('Record created.', async () => { await request('/api/kernel', { type: 'review', changeId: proposal.id, decision: 'apply' }); await refresh() })}
            />)}</section> : null}
            {view && shell === 'desk' && rules ? <div className="saved-view-context"><span className="saved-view-summary">{rules.summary}</span>{rules.details.length ? <details key={view.id} className="saved-view-rules"><summary>View rules</summary><ul>{rules.details.map((rule, index) => <li key={index}>{rule}</li>)}{view.filters.some(filter => filter.field === '$updatedAt') ? <li>Related calls and tasks do not change this record's last updated date.</li> : null}</ul></details> : null}{viewRecords.length === 0 ? <span className="saved-view-count">0 {nouns}</span> : null}{records.length ? <Button variant="ghost" size="sm" onPress={() => { setEntitySlug(definition.slug); chooseView(null) }}>All {nouns}</Button> : null}</div> : null}
            {overview || board || inbox || shell === 'tracker' || shell === 'dashboard' || viewRecords.length === 0 ? null : <div className="desk-views"><ToggleGroup label="Status" value={status} onChange={setStatus} options={[
              { value: 'all', label: `${view ? 'All in view' : `All ${nouns}`} · ${viewRecords.length}` },
              ...statuses.filter(value => (statusCounts.get(value) ?? 0) > 0 || status === value).map(value => ({ value, label: `${statusLabel(value)} · ${statusCounts.get(value) ?? 0}` })),
              ...(pendingCount ? [{ value: 'pending', label: `Needs review · ${pendingCount}` }] : []),
            ]} /></div>}
            {overview || inbox || viewRecords.length === 0 ? null : <div className="desk-toolbar"><div className="desk-search"><Search aria-hidden="true" /><Field value={query} onChange={setQuery} aria-label={`Search ${nouns}`}><Input placeholder={`Search ${nouns}…`} /></Field></div>{board ? null : <Button variant="ghost" size="sm" onPress={() => setSort(sort === 'name' ? 'newest' : 'name')}><ArrowDownWideNarrow data-icon="inline-start" />{sort === 'name' ? 'Name A–Z' : sort === 'newest' || !view || view.sort.field === '$createdAt' && view.sort.direction === 'desc' ? 'Newest first' : `${view.sort.field === '$createdAt' ? 'Created' : definition.entity.fields[view.sort.field]?.label} ${view.sort.direction === 'asc' ? '↑' : '↓'}`}</Button>}<span className="desk-result-count">{records.length} {records.length === 1 ? noun : nouns}</span></div>}
            {page && page.total > page.loaded ? <div className="record-page-note" role="status"><span>Showing the newest {page.loaded.toLocaleString()} of {page.total.toLocaleString()} {nouns}. Views, counts, search and export cover loaded {nouns}.</span>{page.loaded < snapshotRecordLimits.max ? <Button variant="outline" size="sm" disabled={busy} onPress={() => void loadMore(definition.slug)}>Load {Math.min(snapshotRecordLimits.page, page.total - page.loaded).toLocaleString()} more</Button> : <span>Agents can reach older {nouns} with query_records.</span>}</div> : null}
            <div className="workbench desk-workbench" data-grammar={grammar} data-shell={shell} data-inspector={showInspector ? 'open' : 'closed'}>
              <Card className="desk-records" data-grammar={grammar}>
                <CardContent>
                  {inbox ? (
                    <><div className="record-inbox-search"><Search aria-hidden="true" /><Field value={query} onChange={setQuery} aria-label={`Search ${nouns}`}><Input placeholder={`Search ${nouns}…`} /></Field></div><ul className="record-inbox">
                      {records.length === 0 ? <li className="record-inbox-empty">{query ? `No ${nouns} match.` : `No ${nouns} yet.`}</li> : records.map(record => (
                        <li key={record.id}>
                          <button type="button" className="record-inbox-item" aria-pressed={record.id === selectedId} data-selected={record.id === selectedId} onClick={() => { setSelectedId(record.id); setAgentOpen(false); setDetailTab('details') }}>
                            <strong>{String(record.data.title)}</strong>
                            <span>{statusLabel(String(record.data.status))}{pendingFor(snapshot, record.id) ? ' · Needs review' : ''}</span>
                          </button>
                        </li>
                      ))}
                    </ul></>
                  ) : overview ? (
                    <RecordOverview definition={definition} records={snapshot.records.filter(record => record.capability === definition.slug && matchesView(record.data, view, { userId: snapshot.principal.userId, now, updatedAt: record.updatedAt }))} />
                  ) : board ? (
                    <RecordBoard columns={view?.columns} definition={definition} records={records} related={snapshot.records} selectedId={selectedId} onSelect={id => { setSelectedId(id); setAgentOpen(false); setDetailTab('details'); if (window.matchMedia('(max-width: 1000px)').matches) document.getElementById('record-detail')?.scrollIntoView({ behavior: 'auto' }) }} />
                  ) : records.length === 0 ? <Empty title={query || status !== 'all' ? `No ${nouns} match these filters.` : followUpToday ? `No ${nouns} need follow-up today.` : view ? `No ${nouns} in this view.` : `No ${nouns} yet.`}>{query || status !== 'all' ? <Button variant="outline" onPress={() => { setQuery(''); setStatus('all') }}>Clear filters</Button> : followUpToday ? <p>{entityRecords.length ? `Your ${entityRecords.length === 1 ? noun : nouns} ${entityRecords.length === 1 ? 'is' : 'are'} still available in All ${nouns}.` : `Create a ${noun} to start tracking follow-ups.`}</p> : view ? <p>{entityRecords.length ? `${entityRecords.length} ${entityRecords.length === 1 ? noun : nouns} ${entityRecords.length === 1 ? 'is' : 'are'} available in All ${nouns}.` : `Create a ${noun} to add it to this view.`}</p> : <p>Choose New {noun} to add the first record. Create related records in their entity queue first.</p>}{view ? <div className="desk-empty-actions">{nextStepView && nextStepCount > 0 && !query && status === 'all' ? <Button variant="outline" onPress={() => { setEntitySlug(definition.slug); chooseView(nextStepView.id) }}>Needs a next step · {nextStepCount}</Button> : null}<Button variant="ghost" onPress={() => { setEntitySlug(definition.slug); chooseView(null) }}>All {nouns}</Button></div> : null}</Empty> : (
                    <div className="table-scroll" role="region" aria-label={grammar === 'directory' ? 'Directory' : 'Record ledger'} tabIndex={0}><table className="data-table">
                      <thead>
                        <tr>
                          <th><span>{definition.entity.label}</span></th>
                          {columns.map(([key, field]) => (
                            <th key={key} className={key === 'amountCents' ? 'numeric' : undefined}>{key === 'amountCents' ? 'Amount' : field.label}</th>
                          ))}
                          {showStatus ? <th>Status</th> : null}<th className="desk-row-arrow"><span className="sr-only">Open</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map(record => (
                          <tr key={record.id} data-selected={record.id === selectedId} onClick={() => { setSelectedId(record.id); setAgentOpen(false); setDetailTab('details') }}>
                            <td>
                              <Button variant="link" className="record-select" aria-pressed={record.id === selectedId} onPress={() => { setSelectedId(record.id); setAgentOpen(false); setDetailTab('details'); if (window.matchMedia('(max-width: 1000px)').matches) document.getElementById('record-detail')?.scrollIntoView({ behavior: 'auto' }) }}>{String(record.data.title)}</Button>
                              <div className="desk-record-reference">{pendingFor(snapshot, record.id) ? 'Needs review' : `#${shortId(record.id)}`}</div>
                            </td>
                            {columns.map(([key, field]) => (
                              <td key={key} className={key === 'amountCents' ? 'numeric' : undefined}>{field.format === 'user' ? memberLabel(snapshot.members ?? [], record.data[key]) : field.reference ? String(snapshot.records.find(r => r.id === record.data[key])?.data.title ?? '—') : cell(key, field, record.data)}</td>
                            ))}
                            {showStatus ? <td className="status"><Badge variant={statusVariant(String(record.data.status))}>{statusLabel(String(record.data.status))}</Badge></td> : null}<td className="desk-row-arrow"><ChevronRight aria-hidden="true" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </CardContent>
              </Card>
              <aside className="inspector desk-inspector" id="record-detail" aria-label="Record details" hidden={!showInspector}>
                {agentOpen ? (
            <ApplicationAssistant onOpenRecord={(capability, recordId) => { setViewId(null); setEntitySlug(capability); setQuery(''); setStatus('all'); setSelectedId(recordId); setAgentOpen(false); setDetailTab('details') }} key={projectSlug} project={projectSlug} owner={snapshot.principal.role === 'owner'} configured={Boolean(snapshot.model?.configured)} onClose={() => setAgentOpen(false)} onChange={refresh} />

) : selected ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>{String(selected.data.title)}</CardTitle>
                      <CardDescription>#{shortId(selected.id)} · {definition.entity.label}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="desk-detail-tabs"><ToggleGroup label="Record panel" value={detailTab} onChange={setDetailTab} options={[{ value: 'details', label: 'Details' }, { value: 'activity', label: 'Activity' }]} /></div>
                      {detailTab === 'activity' ? <div className="desk-activity"><div><Clock3 /><div><strong>Record created</strong><p>{date(selected.createdAt)}</p></div></div>{snapshot.executions.filter(event => event.recordId === selected.id).map(event => <div key={event.id}><Clock3 /><div><strong>{definition.actions.find(action => action.name === event.action.split('.').at(-1))?.label ?? (event.action === 'record.create' ? 'Record created' : statusLabel(event.action.split('.').at(-1) ?? event.action))} · {event.outcome}</strong><p>{event.actorName} · {date(event.createdAt)}</p></div></div>)}</div> : <>
                      <RecordDetail key={selected.id} definition={definition} data={selected.data} records={snapshot.records} layout={snapshot.project?.presentation?.layouts?.find(layout => layout.entity === definition.slug)} />
                      <RelatedRecords busy={busy} onCreate={canCreate ? (capability, field) => { setRelatedCreation({ capability, references: { [field]: selected.id } }); setError(''); setCreateOpen(true) } : undefined} record={selected} records={snapshot.records} capabilities={snapshot.capabilities} onSelect={record => { setViewId(null); setEntitySlug(record.capability); setQuery(''); setStatus('all'); setSelectedId(record.id); setDetailTab('details') }} />
                      {pending ? (
                        <PendingApply
                          record={selected}
                          proposal={pending}
                          definition={definition}
                          records={snapshot.records}
                          busy={busy}
                          canReview={canReview}
                          onReject={() => run('Proposal rejected.', async () => {
                            await request('/api/kernel', { type: 'review', changeId: pending.id, decision: 'reject' })
                            await refresh()
                          })}
                          onApply={() => run('Proposal applied.', async () => {
                            await request('/api/kernel', { type: 'review', changeId: pending.id, decision: 'apply' })
                            await refresh()
                          })}
                        />
                      ) : (
                        <>
                          <Separator />
                          <div className="actions">
                            {selectedActions.length === 0 ? <p className="muted">Nothing to do on this {noun}.</p> : selectedActions.map(action => (
                              <Button key={action.name} variant={destructive.has(action.name) ? 'destructive' : 'default'} onPress={() => { setActionContext({ record: structuredClone(selected), definitionVersion: capability!.version }); setActionName(action.name) }}>{action.label}</Button>
                            ))}
                          </div>
                        </>
                      )}
                      </>}
                    </CardContent>
                  </Card>
                ) : <Empty title={`Select a ${noun}.`} />}
              </aside>
            </div>
          </div>
        </main>
      </ProjectFrame>
      <CreateEntityDialog key={`${creationDefinition.slug}:${createOpen}`} initialReferences={relatedCreation?.references} error={error} open={createOpen} definition={creationDefinition} layout={snapshot.project?.presentation?.layouts?.find(layout => layout.entity === creationDefinition.slug)} records={snapshot.records} busy={busy} onOpenChange={setCreateOpen} onCreate={data => run(`${creationDefinition.entity.label} created.`, async () => {
        await request('/api/kernel', { type: 'create', capability: creationDefinition.slug, data })
        setCreateOpen(false)
        await refresh()
      })} />
      <ActionDialog
        error={error}
        open={Boolean(actionName && selected)}
        actionName={actionName}
        record={actionContext?.record}
        definition={definition}
        records={snapshot.records}
        busy={busy}
        onOpenChange={open => { if (!open) setActionName(undefined) }}
        role={snapshot.principal.role}
        onSubmit={(action, input) => run(definition.actions.find(item => item.name === action)?.humanExecution === 'direct' ? 'Changes saved.' : 'Proposal staged.', async () => {
          if (!actionContext) return
          const selected = actionContext.record
          const key = idempotencyKey(keys.current, `${action}:${selected.id}`)
          const direct = definition.actions.find(item => item.name === action)?.humanExecution === 'direct'
          const result = await request<ActionResult>('/api/kernel', direct ? { type: 'act', recordId: selected.id, action, input, expectedVersion: selected.version, definitionVersion: actionContext.definitionVersion } : { type: 'stage', recordId: selected.id, action, input, idempotencyKey: key })
          if (result.status === 'blocked') throw new Error(result.checks?.find(check => !check.passed)?.message || 'This action is blocked by policy.')
          keys.current.delete(`${action}:${selected.id}`)
          setActionName(undefined)
          await refresh()
        })}
      />
    </AssignmentMembers.Provider>
  )
}
