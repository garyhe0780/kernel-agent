import { RecordBoard } from './record-board'
import { RecordDetail } from './record-detail'
import { RecordOverview } from './record-overview'
import { matchesView, sortViewRecords } from '@/kernel/application-views'
import { resolveViewGrammar } from '@/kernel/grammars'
import { appShellForPattern } from '@/kernel/patterns'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { Plus, Sparkles, ArrowDownWideNarrow, Search, ChevronRight, X, Clock3 } from 'lucide-react'
import { Toaster } from 'sonner'
import { ActionDialog, CreateEntityDialog, PendingApply } from '@/components/kernel-dialogs'
import { LoadingShell, ProjectFrame } from '@/components/project-frame'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Separator, Spinner, ToggleGroup } from '@/components/ui/surfaces'
import type { Definition, Field as EntityField, RecordData } from '@/kernel/definition'
import { date, shortId, money, request, type ActionResult } from '@/lib/client'
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
  return String(value)
}

export function WorkbenchApp({ projectSlug }: { projectSlug: string }) {
  const { session, snapshot, error, busy, run, refresh, keys } = useProject(projectSlug)
  const [entitySlug, setEntitySlug] = useState<string>()
  const [instruction, setInstruction] = useState('')
  const [agentResult, setAgentResult] = useState('')
  const [agentOpen, setAgentOpen] = useState(false)
  const [detailTab, setDetailTab] = useState('details')
  const [sort, setSort] = useState<'newest' | 'name'>()
  const [viewId, setViewId] = useState<string | null>()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [actionName, setActionName] = useState<string>()

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
      return matchesView(record.data, view) && matchesStatus && (!needle || haystack.includes(needle))
    }), viewSort)
  }, [definition, query, snapshot, status, sort, view])

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
      ? <main className="auth-page"><Alert variant="danger">{error}</Alert><p><Link to="/">Back to projects</Link></p></main>
      : <LoadingShell />
  }

  const selected = records.find(record => record.id === selectedId)
  const pending = selected ? pendingFor(snapshot, selected.id) : undefined
  const selectedActions = selected
    ? definition.actions.filter(action => !pending && actionAvailable(definition, selected, action.name, snapshot.principal.role))
    : []
  const pendingCount = snapshot.changes.filter(change => change.capability === definition.slug && change.status === 'pending' && snapshot.records.some(record => record.id === change.recordId && matchesView(record.data, view))).length
  const canReview = definition.reviewerRoles.includes(snapshot.principal.role)
  const columns = view?.columns.length ? view.columns.filter(key => key !== 'title' && key !== 'status').map(key => [key, definition.entity.fields[key]] as [string, EntityField]) : extraColumns(definition)
  const showStatus = !view?.columns.length || view.columns.includes('status')
  const chooseView = (id: string | null) => { setViewId(id); setSort(undefined); setStatus('all'); setQuery(''); setSelectedId(undefined); setAgentOpen(false) }
  const statuses = definition.entity.fields.status?.options ?? []
  const noun = definition.entity.label.toLowerCase()
  const nouns = plural(noun)
  const grammar = view ? resolveViewGrammar(view) : 'ledger'
  const shell = appShellForPattern(snapshot.project?.pattern)
  const inbox = shell === 'inbox'
  const overview = !inbox && grammar === 'overview'
  const board = !inbox && grammar === 'board' && shell !== 'ledger'
  const showInspector = agentOpen || inbox || shell === 'desk' || (Boolean(selected) && !(shell === 'dashboard' && overview))

  return (
    <>
      <Toaster position="top-right" />
      <ProjectFrame snapshot={snapshot} activeEntity={definition.slug} activeView={view?.id} onViewChange={chooseView} reviewing={status === 'pending'} onEntityChange={value => { setEntitySlug(value); setViewId(null); setSort(undefined); setStatus('all'); setQuery(''); setSelectedId(undefined); setActionName(undefined); setAgentOpen(false) }} onReview={() => { setEntitySlug(definition.slug); setViewId(null); setStatus('pending'); setQuery(''); setAgentOpen(false) }}>
        <main className="main desk-main" id="main-content" tabIndex={-1}>
          <header className="main-header">
            <div>
              <h1>{view?.name ?? plural(definition.entity.label)}</h1>
              <p>{view ? `${plural(definition.entity.label)} · ` : ''}{snapshot.project?.description ?? definition.description}</p>
            </div>
            <div className="desk-header-actions"><Button variant="outline" aria-pressed={agentOpen} onPress={() => setAgentOpen(!agentOpen)}><Sparkles data-icon="inline-start" />Assistant</Button><Button onPress={() => setCreateOpen(true)}><Plus data-icon="inline-start" />New {noun}</Button></div>
          </header>
          <div className="main-body">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            {view && shell === 'desk' ? <div className="saved-view-context"><span>Saved view · {view.filters.length ? `${view.filters.length} filter${view.filters.length === 1 ? '' : 's'}` : 'No filters'}</span><Button variant="ghost" size="sm" onPress={() => { setEntitySlug(definition.slug); chooseView(null) }}>All {nouns}</Button></div> : null}
            {overview || board || inbox || shell === 'tracker' || shell === 'dashboard' ? null : <div className="desk-views"><ToggleGroup label="Status" value={status} onChange={setStatus} options={[
              { value: 'all', label: `${view ? 'All in view' : `All ${nouns}`} · ${snapshot.records.filter(r => r.capability === definition.slug && matchesView(r.data, view)).length}` },
              ...statuses.map(value => ({ value, label: `${statusLabel(value)} · ${snapshot.records.filter(r => r.capability === definition.slug && r.data.status === value && matchesView(r.data, view)).length}` })),
              ...(pendingCount ? [{ value: 'pending', label: `Needs review · ${pendingCount}` }] : []),
            ]} /></div>}
            {overview || inbox || board ? null : <div className="desk-toolbar"><div className="desk-search"><Search aria-hidden="true" /><Field value={query} onChange={setQuery} aria-label={`Search ${nouns}`}><Input placeholder={`Search ${nouns}…`} /></Field></div>{board ? null : <Button variant="ghost" size="sm" onPress={() => setSort(sort === 'name' ? 'newest' : 'name')}><ArrowDownWideNarrow data-icon="inline-start" />{sort === 'name' ? 'Name A–Z' : sort === 'newest' || !view || view.sort.field === '$createdAt' && view.sort.direction === 'desc' ? 'Newest first' : `${view.sort.field === '$createdAt' ? 'Created' : definition.entity.fields[view.sort.field]?.label} ${view.sort.direction === 'asc' ? '↑' : '↓'}`}</Button>}<span className="desk-result-count">{records.length} {records.length === 1 ? noun : nouns}</span></div>}
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
                    <RecordOverview definition={definition} records={snapshot.records.filter(record => record.capability === definition.slug && matchesView(record.data, view))} />
                  ) : board ? (
                    <RecordBoard definition={definition} records={records} related={snapshot.records} selectedId={selectedId} onSelect={id => { setSelectedId(id); setAgentOpen(false); setDetailTab('details'); if (window.matchMedia('(max-width: 1000px)').matches) document.getElementById('record-detail')?.scrollIntoView({ behavior: 'auto' }) }} />
                  ) : records.length === 0 ? <Empty title={query || status !== 'all' ? `No ${nouns} match these filters.` : view ? `No ${nouns} match this view.` : `No ${nouns} yet.`}>{query || status !== 'all' ? <Button variant="outline" onPress={() => { setQuery(''); setStatus('all') }}>Clear filters</Button> : view ? <p>Records outside this saved view are available in All {nouns}.</p> : <p>Choose New {noun} to add the first record. Create related records in their entity queue first.</p>}{view ? <Button variant="outline" onPress={() => { setEntitySlug(definition.slug); chooseView(null) }}>All {nouns}</Button> : null}</Empty> : (
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
                              <td key={key} className={key === 'amountCents' ? 'numeric' : undefined}>{field.reference ? String(snapshot.records.find(r => r.id === record.data[key])?.data.title ?? '—') : cell(key, field, record.data)}</td>
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
            <section className="desk-assistant"><header><h2>Application assistant</h2><Button variant="ghost" size="icon" aria-label="Close assistant" onPress={() => setAgentOpen(false)}><X /></Button></header><p className="muted">{snapshot.model?.configured ? 'Ask for one action. The agent reads this application’s records and proposes a change for owner review.' : 'The built-in model is not connected. Your workspace owner can configure it on the server. External agents can connect through Configure → Agents.'}</p><Field value={instruction} onChange={setInstruction}><FieldLabel>Task</FieldLabel><Input placeholder={`What would you like to do with your ${nouns}?`} /></Field><Button variant="outline" disabled={!snapshot.model?.configured || busy || instruction.trim().length < 5} onPress={() => run('Agent finished.', async () => {
              const key = idempotencyKey(keys.current, `operate:${instruction}`)
              const result = await request<ActionResult & { explanation: string }>('/api/kernel', { type: 'operate', project: projectSlug, instruction, idempotencyKey: key })
              setAgentResult(`${result.status === 'staged' ? 'Proposal staged for review. ' : result.status === 'blocked' ? 'Blocked by policy. ' : ''}${result.explanation}${result.checks?.filter(c => !c.passed).map(c => ` ${c.message}`).join('') ?? ''}`)
              keys.current.delete(`operate:${instruction}`)
              await refresh()
            })}>{busy ? <Spinner data-icon="inline-start" /> : null}Ask agent</Button>{agentResult ? <Alert>{agentResult}</Alert> : null}</section>

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
                              <Button key={action.name} variant={destructive.has(action.name) ? 'destructive' : 'default'} onPress={() => setActionName(action.name)}>{action.label}</Button>
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
      <CreateEntityDialog error={error} open={createOpen} definition={definition} records={snapshot.records} busy={busy} onOpenChange={setCreateOpen} onCreate={data => run(`${definition.entity.label} created.`, async () => {
        await request('/api/kernel', { type: 'create', capability: definition.slug, data })
        setCreateOpen(false)
        await refresh()
      })} />
      <ActionDialog
        error={error}
        open={Boolean(actionName && selected)}
        actionName={actionName}
        record={selected}
        definition={definition}
        records={snapshot.records}
        busy={busy}
        onOpenChange={open => { if (!open) setActionName(undefined) }}
        role={snapshot.principal.role}
        onSubmit={(action, input) => run('Proposal staged.', async () => {
          if (!selected) return
          const key = idempotencyKey(keys.current, `${action}:${selected.id}`)
          const result = await request<ActionResult>('/api/kernel', { type: 'stage', recordId: selected.id, action, input, idempotencyKey: key })
          if (result.status === 'blocked') throw new Error(result.checks?.find(check => !check.passed)?.message || 'This action is blocked by policy.')
          keys.current.delete(`${action}:${selected.id}`)
          setActionName(undefined)
          await refresh()
        })}
      />
    </>
  )
}
