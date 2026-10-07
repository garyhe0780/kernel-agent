import { ExportRecords } from './export-records'
import { AssignmentMembers, memberLabel, useViewClock } from './record-context'
import { ApplicationAssistant } from './application-assistant'
import { RecordBoard } from './record-board'
import { RelatedRecords } from './related-records'
import { RecordDetail } from './record-detail'
import { recordSearchText } from '@/lib/record-search'
import { matchesView, relativeDate, sortViewRecords, type SavedView } from '@/kernel/application-views'
import { resolveViewGrammar } from '@/kernel/grammars'
import { appShellForPattern } from '@/kernel/patterns'
import { snapshotRecordLimits } from '@/kernel/record-operations'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { Plus, Sparkles, ArrowDownWideNarrow, Search, ChevronRight, Clock3, ArrowLeft, ArrowLeftRight, X } from 'lucide-react'
import { ActionDialog, CreateEntityDialog, PendingApply, PendingReviewActions } from '@/components/kernel-dialogs'
import { LoadingShell, ProjectFrame } from '@/components/project-frame'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Tabs } from '@/components/ui/tabs'
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Spinner, ToggleGroup } from '@/components/ui/surfaces'
import type { Definition, Field as EntityField, RecordData } from '@/kernel/definition'
import { date, shortId, money, request, type ActionResult, type BusinessRecord, type CapabilitySnapshot } from '@/lib/client'
import { actionAvailable, capabilityOf, idempotencyKey, pendingFor, pluralLabel as plural, statusLabel, statusVariant } from '@/lib/project-ui'
import { useProject } from '@/lib/use-project'

const destructive = new Set(['lose', 'retire', 'offboard', 'decline', 'cancel'])
const RecordOverview = lazy(() => import('./record-overview').then(module => ({ default: module.RecordOverview })))

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
  const assistantTrigger = useRef<HTMLButtonElement>(null)
  const [detailTab, setDetailTab] = useState('details')
  const [sort, setSort] = useState<'newest' | 'name'>()
  const [viewId, setViewId] = useState<string | null>()
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
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
  const searchLabels = useMemo(() => ({
    records: new Map(snapshot?.records.map(record => [record.id, String(record.data.title ?? '')]) ?? []),
    members: new Map(snapshot?.members?.map(member => [member.id, member.name]) ?? []),
  }), [snapshot])
  const pendingRecords = useMemo(() => new Set(snapshot?.changes.filter(change => change.status === 'pending').map(change => change.recordId) ?? []), [snapshot])
  const records = useMemo(() => {
    if (!snapshot || !definition) return []
    const needle = query.trim().toLowerCase()
    return sortViewRecords(snapshot.records.filter(record => {
      if (record.capability !== definition.slug) return false
      const matchesStatus = status === 'all' || (status === 'pending' ? pendingRecords.has(record.id) : record.data.status === status)
      const haystack = needle ? recordSearchText(record.data, definition, searchLabels.records, searchLabels.members) : ''
      return matchesView(record.data, view, { userId: snapshot.principal.userId, now, updatedAt: record.updatedAt }) && matchesStatus && (!needle || haystack.includes(needle))
    }), viewSort)
  }, [definition, query, snapshot, status, sort, view, now, searchLabels, pendingRecords])

  useEffect(() => {
    if (records.length === 0) {
      setSelectedId(current => current === undefined ? current : undefined)
      return
    }
    if (!records.some(record => record.id === selectedId)) setSelectedId(records[0].id)
  }, [records, selectedId])

  useEffect(() => {
    if (!agentOpen) return
    const detail = document.getElementById('record-detail')
    detail?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
    if (detail?.parentElement && getComputedStyle(detail.parentElement).gridTemplateColumns.split(' ').length === 1) detail.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [agentOpen])

  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot || !definition) {
    return error
      ? <main className="auth-page"><h1>Application could not be loaded</h1><Alert variant="danger">{error}</Alert><Button disabled={busy} onPress={() => void run('Application loaded.', async () => { await refresh() })}>{busy ? <Spinner data-icon="inline-start" /> : null}Try again</Button><p><Link to="/workspace">Back to applications</Link></p></main>
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
  const fixedViewStatus = view?.filters.some(filter => filter.field === 'status' && filter.operator === 'eq')
  const showStatus = (!view?.columns.length || view.columns.includes('status')) && !fixedViewStatus
  const chooseView = (id: string | null) => { setViewId(id); setSort(undefined); setStatus('all'); setQuery(''); setSelectedId(undefined); setAgentOpen(false) }
  const statuses = definition.entity.fields.status?.options ?? []
  const noun = definition.entity.label.toLowerCase()
  const nouns = plural(noun)
  const article = /^[aeiou]/i.test(noun) ? 'an' : 'a'
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
  const populatedStatuses = statuses.filter(value => (statusCounts.get(value) ?? 0) > 0 || status === value)
  const showStatusFilters = populatedStatuses.length > 1 || pendingCount > 0 || status !== 'all'

  function clearRecordSearch() {
    setQuery('')
    searchRef.current?.focus()
  }

  function clearFilters() {
    clearRecordSearch()
    setStatus('all')
  }

  function selectRecord(id: string) {
    setSelectedId(id)
    setAgentOpen(false)
    setDetailTab('details')
    revealRecordDetail()
  }

  function revealRecordDetail() {
    requestAnimationFrame(() => {
      const detail = document.getElementById('record-detail')
      detail?.querySelector('.tabs-panel')?.scrollTo({ top: 0 })
      if (detail?.parentElement && getComputedStyle(detail.parentElement).gridTemplateColumns.split(' ').length === 1) {
        detail?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
        detail?.scrollIntoView({ block: 'start', behavior: 'auto' })
      }
    })
  }

  function returnToRecords() {
    const queue = document.getElementById('record-queue')
    const selectedButton = queue?.querySelector<HTMLElement>('button[aria-pressed="true"]')
    const target = selectedButton ?? queue
    target?.focus({ preventScroll: true })
    queue?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }

  function closeAssistant() {
    setAgentOpen(false)
    assistantTrigger.current?.focus({ preventScroll: true })
    assistantTrigger.current?.scrollIntoView({ block: 'nearest' })
  }

  const rejectSelectedProposal = () => {
    if (!pending) return
    void run('Proposal rejected.', async () => {
      await request('/api/kernel', { type: 'review', changeId: pending.id, decision: 'reject' })
      await refresh()
    })
  }

  const applySelectedProposal = () => {
    if (!pending) return
    void run('Proposal applied.', async () => {
      await request('/api/kernel', { type: 'review', changeId: pending.id, decision: 'apply' })
      await refresh()
    })
  }

  return (
    <AssignmentMembers.Provider value={snapshot.members ?? []}>
      <ProjectFrame snapshot={snapshot} activeEntity={definition.slug} activeView={view?.id} onViewChange={chooseView} reviewing={status === 'pending'} onEntityChange={value => { setEntitySlug(value); setViewId(null); setSort(undefined); setStatus('all'); setQuery(''); setSelectedId(undefined); setActionName(undefined); setAgentOpen(false) }} onReview={() => { setEntitySlug(definition.slug); setViewId(null); setStatus('pending'); setQuery(''); setAgentOpen(false) }}>
        <main className="main desk-main" id="main-content" tabIndex={-1}>
          <header className="main-header">
            <div>
              <h1>{status === 'pending' ? `Review ${nouns}` : view?.name ?? plural(definition.entity.label)}</h1>
              {!view ? <p>{snapshot.project?.description ?? definition.description}</p> : null}
            </div>
            <div className="desk-header-actions flex-wrap">{records.length ? <ExportRecords definition={definition} records={records} related={snapshot.records} name={`${snapshot.project?.name ?? definition.name}-${view?.name ?? definition.name}`} /> : null}<Button ref={assistantTrigger} variant="outline" aria-pressed={agentOpen} aria-controls="record-detail" onPress={() => setAgentOpen(!agentOpen)}><Sparkles data-icon="inline-start" />Assistant</Button><Button disabled={!canCreate || busy} onPress={() => { setRelatedCreation(undefined); setError(''); setCreateOpen(true) }}><Plus data-icon="inline-start" />New {noun}</Button></div>
          </header>
          <div className="main-body">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            {creations.length ? <section aria-label="Proposed new records"><h2>New records awaiting review · {creations.length}</h2>{creations.map(proposal => <PendingApply key={proposal.id} proposal={proposal} definition={definition} definitionVersion={capability?.version} records={snapshot.records} busy={busy} canReview={canReview}
              onReject={() => run('Proposal rejected.', async () => { await request('/api/kernel', { type: 'review', changeId: proposal.id, decision: 'reject' }); await refresh() })}
              onApply={() => run('Record created.', async () => { await request('/api/kernel', { type: 'review', changeId: proposal.id, decision: 'apply' }); await refresh() })}
            />)}</section> : null}
            {view && shell === 'desk' && rules ? <div className="saved-view-context"><span className="saved-view-summary">{rules.summary}</span>{rules.details.length ? <details key={view.id} className="saved-view-rules"><summary>View rules</summary><ul>{rules.details.map((rule, index) => <li key={index}>{rule}</li>)}{view.filters.some(filter => filter.field === '$updatedAt') ? <li>Related calls and tasks do not change this record's last updated date.</li> : null}</ul></details> : null}{viewRecords.length === 0 ? <span className="saved-view-count">0 {nouns}</span> : null}{records.length ? <Button variant="ghost" size="sm" onPress={() => { setEntitySlug(definition.slug); chooseView(null) }}>All {nouns}</Button> : null}</div> : null}
            {status === 'pending' || overview || board || inbox || shell === 'tracker' || shell === 'dashboard' || viewRecords.length === 0 || !showStatusFilters ? null : <div className="desk-views"><ToggleGroup label="Status" value={status} onChange={setStatus} options={[
              { value: 'all', label: `${view ? 'All in view' : `All ${nouns}`} · ${viewRecords.length}` },
              ...populatedStatuses.map(value => ({ value, label: `${statusLabel(value)} · ${statusCounts.get(value) ?? 0}` })),
              ...(pendingCount ? [{ value: 'pending', label: `Needs review · ${pendingCount}` }] : []),
            ]} /></div>}
            {overview || inbox || viewRecords.length === 0 ? null : <div className="desk-toolbar"><div className="desk-search"><Search aria-hidden="true" /><Field value={query} onChange={setQuery} aria-label={`Search ${nouns}`}><Input ref={searchRef} aria-describedby="record-search-status" placeholder={`Search ${nouns}…`} /></Field>{query ? <Button variant="ghost" size="icon" aria-label="Clear record search" onPress={clearRecordSearch}><X data-icon="inline-start" aria-hidden="true" /></Button> : null}</div>{board ? null : <Button variant="ghost" size="sm" onPress={() => setSort(sort === 'name' ? 'newest' : 'name')}><ArrowDownWideNarrow data-icon="inline-start" />{sort === 'name' ? 'Name A–Z' : sort === 'newest' || !view || view.sort.field === '$createdAt' && view.sort.direction === 'desc' ? 'Newest first' : `${view.sort.field === '$createdAt' ? 'Created' : definition.entity.fields[view.sort.field]?.label} ${view.sort.direction === 'asc' ? '↑' : '↓'}`}</Button>}<span className="desk-result-count" id="record-search-status" role="status" aria-atomic="true">{records.length} {records.length === 1 ? noun : nouns}</span></div>}
            {page && page.total > page.loaded ? <div className="record-page-note" role="status"><span>Showing the newest {page.loaded.toLocaleString()} of {page.total.toLocaleString()} {nouns}. Views, counts, search and export cover loaded {nouns}.</span>{page.loaded < snapshotRecordLimits.max ? <Button variant="outline" size="sm" disabled={busy} onPress={() => void loadMore(definition.slug)}>Load {Math.min(snapshotRecordLimits.page, page.total - page.loaded).toLocaleString()} more</Button> : <span>Agents can reach older {nouns} with query_records.</span>}</div> : null}
            <div className="workbench desk-workbench" data-empty={records.length === 0 && !overview && !board && !inbox} data-grammar={grammar} data-shell={shell} data-inspector={showInspector ? 'open' : 'closed'}>
              <Card className="desk-records" id="record-queue" tabIndex={-1} data-grammar={grammar}>
                <CardContent>
                  {inbox ? (
                    <><div className="record-inbox-search"><Search aria-hidden="true" /><Field value={query} onChange={setQuery} aria-label={`Search ${nouns}`}><Input placeholder={`Search ${nouns}…`} /></Field></div><ul className="record-inbox">
                      {records.length === 0 ? <li className="record-inbox-empty">{query ? `No ${nouns} match.` : `No ${nouns} yet.`}</li> : records.map(record => (
                        <li key={record.id}>
                          <button type="button" className="record-inbox-item" aria-pressed={record.id === selectedId} data-selected={record.id === selectedId} onClick={() => selectRecord(record.id)}>
                            <strong>{String(record.data.title)}</strong>
                            <span>{statusLabel(String(record.data.status))}{pendingFor(snapshot, record.id) ? ' · Needs review' : ''}</span>
                          </button>
                        </li>
                      ))}
                    </ul></>
                  ) : overview ? (
                    <Suspense fallback={<p className="overview-loading" role="status"><Spinner />Loading overview…</p>}><RecordOverview definition={definition} records={viewRecords} /></Suspense>
                  ) : board ? (
                    <>{query && !records.length ? <Empty headingLevel={2} title={`No ${nouns} match this search.`}><Button variant="outline" onPress={clearRecordSearch}>Clear search</Button></Empty> : <RecordBoard columns={view?.columns} definition={definition} records={records} related={snapshot.records} selectedId={selectedId} onSelect={selectRecord} />}</>
                  ) : records.length === 0 ? <Empty headingLevel={2} title={status === 'pending' ? `No ${nouns} awaiting review.` : query || status !== 'all' ? `No ${nouns} match these filters.` : followUpToday ? `No ${nouns} need follow-up today.` : view ? `No ${nouns} in this view.` : `No ${nouns} yet.`}>{status === 'pending' ? <><p>Proposed changes will appear here when they need your review.</p><Button variant="outline" onPress={clearFilters}>All {nouns}</Button></> : query || status !== 'all' ? <Button variant="outline" onPress={clearFilters}>Clear filters</Button> : followUpToday ? <p>{entityRecords.length ? `Your ${entityRecords.length === 1 ? noun : nouns} ${entityRecords.length === 1 ? 'is' : 'are'} still available in All ${nouns}.` : `Create ${article} ${noun} to start tracking follow-ups.`}</p> : view ? <p>{entityRecords.length ? `${entityRecords.length} ${entityRecords.length === 1 ? noun : nouns} ${entityRecords.length === 1 ? 'is' : 'are'} available in All ${nouns}.` : `Create ${article} ${noun} to add it to this view.`}</p> : <p>Choose New {noun} to add the first record. Create related records in their entity queue first.</p>}{view ? <div className="desk-empty-actions">{nextStepView && nextStepCount > 0 && !query && status === 'all' ? <Button variant="outline" onPress={() => { setEntitySlug(definition.slug); chooseView(nextStepView.id) }}>Needs a next step · {nextStepCount}</Button> : null}<Button variant="ghost" onPress={() => { setEntitySlug(definition.slug); chooseView(null) }}>All {nouns}</Button></div> : null}</Empty> : (
                    <><p className="desk-table-hint" id="record-table-hint"><ArrowLeftRight aria-hidden="true" />Scroll table to see all fields.</p><div className="table-scroll" role="region" aria-describedby="record-table-hint" aria-label={grammar === 'directory' ? 'Directory' : 'Record ledger'} tabIndex={0}><table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col"><span>{definition.entity.label}</span></th>
                          {columns.map(([key, field]) => (
                            <th scope="col" key={key} className={key === 'amountCents' ? 'numeric' : undefined}>{key === 'amountCents' ? 'Amount' : field.label}</th>
                          ))}
                          {showStatus ? <th scope="col">Status</th> : null}<th scope="col" className="desk-row-arrow"><span className="sr-only">Open</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map(record => (
                          <tr key={record.id} data-selected={record.id === selectedId} onClick={event => { if (!(event.target as HTMLElement).closest('button')) selectRecord(record.id) }}>
                            <td>
                              <Button variant="link" className="record-select" aria-pressed={record.id === selectedId} onPress={() => selectRecord(record.id)}>{String(record.data.title)}</Button>
                              <div className="desk-record-reference">{pendingFor(snapshot, record.id) ? 'Needs review' : `#${shortId(record.id)}`}</div>
                            </td>
                            {columns.map(([key, field]) => (
                              <td key={key} className={key === 'amountCents' ? 'numeric' : undefined}>{field.format === 'user' ? memberLabel(snapshot.members ?? [], record.data[key]) : field.reference ? String(snapshot.records.find(r => r.id === record.data[key])?.data.title ?? '—') : cell(key, field, record.data)}</td>
                            ))}
                            {showStatus ? <td className="status"><Badge variant={statusVariant(String(record.data.status))}>{statusLabel(String(record.data.status))}</Badge></td> : null}<td className="desk-row-arrow"><ChevronRight aria-hidden="true" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div></>
                  )}
                </CardContent>
              </Card>
              <aside className="inspector desk-inspector" id="record-detail" aria-label={agentOpen ? 'Application assistant' : 'Record details'} hidden={!showInspector}>
                {agentOpen ? (
            <ApplicationAssistant onOpenRecord={(capability, recordId) => { setViewId(null); setEntitySlug(capability); setQuery(''); setStatus('all'); setSelectedId(recordId); setAgentOpen(false); setDetailTab('details'); revealRecordDetail() }} key={projectSlug} project={projectSlug} owner={snapshot.principal.role === 'owner'} configured={Boolean(snapshot.model?.configured)} onClose={closeAssistant} onChange={refresh} />

                ) : selected ? (
                  <Card className="desk-detail-card desk-inspector-panel">
                    <CardHeader>
                      <div className="desk-return-to-records"><Button variant="ghost" onPress={returnToRecords}><ArrowLeft data-icon="inline-start" aria-hidden="true" />Back to {nouns}</Button></div>
                      <CardTitle tabIndex={-1}>{String(selected.data.title)}</CardTitle>
                      <div className="desk-detail-identity"><CardDescription>#{shortId(selected.id)} · {definition.entity.label}</CardDescription><Badge variant={statusVariant(String(selected.data.status))}>{statusLabel(String(selected.data.status))}</Badge></div>
                    </CardHeader>
                    <div className="desk-detail-tabs">
                      <Tabs label="Record panel" value={detailTab} onChange={setDetailTab} tabs={[
                        { id: 'details', label: 'Details', panel: <>
                      <RecordDetail inspector key={selected.id} definition={definition} data={selected.data} records={snapshot.records} layout={snapshot.project?.presentation?.layouts?.find(layout => layout.entity === definition.slug)} />
                      <RelatedRecords busy={busy} onCreate={canCreate ? (capability, field) => { setRelatedCreation({ capability, references: { [field]: selected.id } }); setError(''); setCreateOpen(true) } : undefined} record={selected} records={snapshot.records} capabilities={snapshot.capabilities} onSelect={record => { setViewId(null); setEntitySlug(record.capability); setQuery(''); setStatus('all'); setSelectedId(record.id); setDetailTab('details'); revealRecordDetail() }} />
                      {pending ? (
                        <PendingApply
                          record={selected}
                          proposal={pending}
                          definition={definition}
                          definitionVersion={capability?.version}
                          records={snapshot.records}
                          busy={busy}
                          canReview={canReview}
                          hideActions
                          onReject={rejectSelectedProposal}
                          onApply={applySelectedProposal}
                        />
                      ) : null}
                      </> },
                        { id: 'activity', label: 'Activity', panel: <div className="desk-activity"><div><Clock3 aria-hidden="true" /><div><strong>Record created</strong><p>{date(selected.createdAt)}</p></div></div>{snapshot.executions.filter(event => event.recordId === selected.id).map(event => <div key={event.id}><Clock3 aria-hidden="true" /><div><strong>{definition.actions.find(action => action.name === event.action.split('.').at(-1))?.label ?? (event.action === 'record.create' ? 'Record created' : statusLabel(event.action.split('.').at(-1) ?? event.action))} · {event.outcome}</strong><p>{event.actorName} · {date(event.createdAt)}</p></div></div>)}</div> },
                      ]} />
                    </div>
                    <footer className="desk-detail-actions" aria-label="Record actions">
                      {pending ? detailTab === 'details' ? <PendingReviewActions record={selected} proposal={pending} definitionVersion={capability?.version} busy={busy} canReview={canReview} onReject={rejectSelectedProposal} onApply={applySelectedProposal} /> : <Button variant="outline" onPress={() => setDetailTab('details')}>Review proposed change</Button> : (
                          <div className="actions">
                            {selectedActions.length === 0 ? <p className="muted">Nothing to do on this {noun}.</p> : selectedActions.map(action => (
                              <Button key={action.name} disabled={busy} variant={destructive.has(action.name) || (typeof action.effects.status === 'string' && statusVariant(action.effects.status) === 'danger') ? 'destructive' : action.name === 'archive' ? 'outline' : 'default'} onPress={() => { setActionContext({ record: structuredClone(selected), definitionVersion: capability!.version }); setActionName(action.name) }}>{action.label}</Button>
                            ))}
                          </div>
                      )}
                    </footer>
                  </Card>
                ) : <Empty title={`Select ${article} ${noun}.`} />}
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
