import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from '@tanstack/react-router'
import { Boxes, ClipboardList, History, LogOut, Plus, Workflow } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, Form, Textarea } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Alert, Badge, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Empty, Separator, Skeleton, Spinner, Switch, ToggleGroup } from '@/components/ui/surfaces'
import { Tabs } from '@/components/ui/tabs'
import { evaluate, type Definition, type RecordData } from '@/kernel/definition'
import { authClient } from '@/lib/auth-client'
import { date, money, request, shortId, type ActionResult, type BusinessRecord, type Snapshot } from '@/lib/client'

type View = 'workspace' | 'review' | 'capability' | 'activity'
const views: { id: View; label: string; icon: typeof Boxes }[] = [
  { id: 'workspace', label: 'Workspace', icon: ClipboardList },
  { id: 'review', label: 'Review', icon: Workflow },
  { id: 'capability', label: 'Capability', icon: Boxes },
  { id: 'activity', label: 'Activity', icon: History },
]

function statusVariant(status: string) {
  if (status === 'approved' || status === 'applied') return 'success' as const
  if (status === 'submitted' || status === 'pending' || status === 'staged') return 'warning' as const
  if (status === 'declined' || status === 'rejected' || status === 'blocked' || status === 'conflict') return 'danger' as const
  if (status === 'primary') return 'primary' as const
  return 'neutral' as const
}

function recordTitle(record: BusinessRecord | undefined) {
  return record ? String(record.data.title) : 'Unknown request'
}

function previewInput(definition: Definition, actionName: string) {
  const action = definition.actions.find(item => item.name === actionName)
  const input: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(action?.input ?? {})) {
    if (field.type === 'integer') input[key] = field.min ?? 1
    else if (field.type === 'boolean') input[key] = Boolean(field.default)
    else if (field.type === 'enum') input[key] = field.options?.[0] ?? ''
    else input[key] = 'Preview reason for availability.'
  }
  return input
}

function actionPreview(definition: Definition, record: BusinessRecord, actionName: string, role: string) {
  try {
    return evaluate(definition, actionName, record.data, previewInput(definition, actionName), role)
  } catch {
    return null
  }
}

function chooseSimulation(snapshot: Snapshot) {
  for (const action of ['submit', 'approve']) {
    for (const record of snapshot.records) {
      const preview = actionPreview(snapshot.capability.definition, record, action, snapshot.principal.role)
      if (preview?.allowed) return { record, action, input: {} as Record<string, unknown> }
    }
  }
  return null
}

function idempotencyKey(store: Map<string, string>, key: string) {
  const existing = store.get(key)
  if (existing) return existing
  const next = `ui-${crypto.randomUUID()}`
  store.set(key, next)
  return next
}

export function WorkspaceApp() {
  const session = authClient.useSession()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [view, setView] = useState<View>('workspace')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState<string>()
  const [selectedChangeId, setSelectedChangeId] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [actionName, setActionName] = useState<string>()
  const [capabilityTab, setCapabilityTab] = useState('policies')
  const [limitDollars, setLimitDollars] = useState('')
  const [requireVerified, setRequireVerified] = useState(true)
  const keys = useRef(new Map<string, string>())

  async function refresh() {
    const next = await request<Snapshot>('/api/kernel')
    setSnapshot(next)
    setLimitDollars(String(Number(next.capability.definition.settings.approvalLimitCents) / 100))
    setRequireVerified(Boolean(next.capability.definition.settings.requireVerifiedSupplier))
    setSelectedId(current => current && next.records.some(record => record.id === current) ? current : next.records[0]?.id)
    setSelectedChangeId(current => current && next.changes.some(change => change.id === current) ? current : next.changes[0]?.id)
    return next
  }

  useEffect(() => {
    if (!session.data) {
      setSnapshot(null)
      return
    }
    let cancelled = false
    request<Snapshot>('/api/kernel')
      .then(next => {
        if (cancelled) return
        setSnapshot(next)
        setLimitDollars(String(Number(next.capability.definition.settings.approvalLimitCents) / 100))
        setRequireVerified(Boolean(next.capability.definition.settings.requireVerifiedSupplier))
        setSelectedId(next.records[0]?.id)
        setSelectedChangeId(next.changes[0]?.id)
      })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load the workspace.') })
    return () => { cancelled = true }
  }, [session.data?.user.id])

  const records = useMemo(() => {
    if (!snapshot) return []
    const needle = query.trim().toLowerCase()
    return snapshot.records.filter(record => {
      const data = record.data
      const matchesStatus = status === 'all' || data.status === status
      const haystack = `${data.title} ${data.supplier} ${data.category} ${shortId(record.id)}`.toLowerCase()
      return matchesStatus && (!needle || haystack.includes(needle))
    })
  }, [query, snapshot, status])

  useEffect(() => {
    if (records.length === 0) {
      setSelectedId(current => current === undefined ? current : undefined)
      return
    }
    if (!records.some(record => record.id === selectedId)) {
      setSelectedId(records[0].id)
    }
  }, [records, selectedId])

  const selected = snapshot?.records.find(record => record.id === selectedId)
  const selectedChange = snapshot?.changes.find(change => change.id === selectedChangeId)
  const pendingCount = snapshot?.changes.filter(change => change.status === 'pending').length ?? 0

  async function run(label: string, work: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await work()
      toast.success(label)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The operation could not complete.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot) {
    return error
      ? <main className="auth-page"><Alert variant="danger">{error}</Alert></main>
      : <LoadingShell />
  }

  const definition = snapshot.capability.definition
  const selectedActions = selected
    ? definition.actions.filter(action => actionPreview(definition, selected, action.name, snapshot.principal.role)?.checks.find(check => check.id === 'state')?.passed)
    : []

  return (
    <>
      <Toaster position="top-right" />
      <div className="app">
        <aside className="nav">
        <a className="brand nav-brand" href="/"><span className="brand-mark">k</span><span>kernel<span className="brand-period">.</span></span></a>
        <nav className="nav-list" aria-label="Workspace">
          {views.map(item => {
            const Icon = item.icon
            return (
              <Button key={item.id} variant="ghost" className="nav-item" aria-current={view === item.id ? 'page' : undefined} onPress={() => setView(item.id)}>
                <Icon />
                {item.label}
                {item.id === 'review' && pendingCount > 0 ? <span className="nav-count">{pendingCount}</span> : null}
              </Button>
            )
          })}
        </nav>
        <div className="simulator-card">
          <Badge variant="warning">Simulator · not a live model</Badge>
          <p>This agent picks a defined action and stages it. It does not call a language model or send a purchase.</p>
          <Button variant="secondary" onPress={() => run('Simulator staged a proposal.', async () => {
            const choice = chooseSimulation(snapshot)
            if (!choice) throw new Error('No eligible submit or approve action is available.')
            const key = idempotencyKey(keys.current, `sim:${choice.action}:${choice.record.id}`)
            const result = await request<ActionResult>('/api/agent', { type: 'stage', recordId: choice.record.id, action: choice.action, input: choice.input, idempotencyKey: key })
            if (result.status === 'blocked') throw new Error(result.checks?.find(check => !check.passed)?.message || 'The simulator was blocked by policy.')
            keys.current.delete(`sim:${choice.action}:${choice.record.id}`)
            const next = await refresh()
            setSelectedChangeId(result.change?.id ?? next.changes[0]?.id)
            setView('review')
          })} disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Stage next action
          </Button>
        </div>
        <div className="nav-user">
          <strong>{snapshot.principal.name}</strong>
          <span>{snapshot.workspace.name} · {snapshot.principal.role}</span>
          <Button variant="ghost" size="sm" onPress={() => authClient.signOut()}>
            <LogOut data-icon="inline-start" />
            Sign out
          </Button>
        </div>
      </aside>
      <div className="main">
        <header className="main-header">
          <div>
            <h1>{view === 'workspace' ? 'Purchase requests' : view === 'review' ? 'Review queue' : view === 'capability' ? 'Procurement capability' : 'Activity'}</h1>
            <p>{view === 'workspace' ? 'Inspect records, then propose the same actions a simulator can stage.' : view === 'review' ? 'Apply or reject the exact proposal. Rechecks happen at apply time.' : view === 'capability' ? `Version ${snapshot.capability.version}. Publishing creates an immutable definition.` : 'Every successful transition leaves an attributable execution event.'}</p>
          </div>
          {view === 'workspace' ? <Button onPress={() => setCreateOpen(true)}><Plus data-icon="inline-start" />New request</Button> : null}
        </header>
        <div className="main-body">
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {view === 'workspace' ? (
            <>
              <div className="toolbar">
                <Field value={query} onChange={setQuery}>
                  <FieldLabel>Search requests</FieldLabel>
                  <Input placeholder="Title, supplier, or ID" />
                </Field>
                <ToggleGroup
                  label="Status"
                  value={status}
                  onChange={setStatus}
                  options={['all', 'draft', 'submitted', 'approved', 'declined'].map(value => ({ value, label: value === 'all' ? 'All statuses' : value }))}
                />
              </div>
              <div className="workbench">
                <Card>
                  <CardHeader>
                    <CardTitle>Operations queue</CardTitle>
                    <CardDescription>{`${records.length} request${records.length === 1 ? '' : 's'} in this workspace.`}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {records.length === 0 ? <Empty title="No requests match these filters." /> : (
                      <table className="data-table">
                        <thead>
                          <tr><th>Request</th><th>Supplier</th><th className="numeric">Amount</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {records.map(record => (
                            <tr key={record.id} aria-selected={record.id === selectedId} tabIndex={0} onClick={() => setSelectedId(record.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(record.id) } }}>
                              <td>
                                <strong>{String(record.data.title)}</strong>
                                <div className="muted">{shortId(record.id)} · {String(record.data.category)}</div>
                              </td>
                              <td>{String(record.data.supplier)}</td>
                              <td className="numeric">{money(record.data.amountCents)}</td>
                              <td className="status"><Badge variant={statusVariant(String(record.data.status))}>{String(record.data.status)}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>
                <aside className="inspector">
                  {selected ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>{String(selected.data.title)}</CardTitle>
                        <CardDescription>Record {shortId(selected.id)} · version {selected.version}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <dl className="kv">
                          <dt>Supplier</dt><dd>{String(selected.data.supplier)}{selected.data.supplierVerified ? ' · verified' : ' · unverified'}</dd>
                          <dt>Amount</dt><dd>{money(selected.data.amountCents)}</dd>
                          <dt>Category</dt><dd>{String(selected.data.category)}</dd>
                          <dt>Status</dt><dd><Badge variant={statusVariant(String(selected.data.status))}>{String(selected.data.status)}</Badge></dd>
                          <dt>Reason</dt><dd>{String(selected.data.justification)}</dd>
                          {selected.data.decisionNote ? <><dt>Decision</dt><dd>{String(selected.data.decisionNote)}</dd></> : null}
                        </dl>
                        <Separator />
                        <div className="actions">
                          {selectedActions.length === 0 ? <p className="muted">No actions are available in this state.</p> : selectedActions.map(action => (
                            <Button key={action.name} variant={action.name === 'decline' ? 'destructive' : 'default'} onPress={() => setActionName(action.name)}>{action.label}</Button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : <Empty title="Select a request to inspect it." />}
                </aside>
              </div>
            </>
          ) : null}
          {view === 'review' ? (
            snapshot.changes.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Proposals</CardTitle>
                  <CardDescription>Pending changes stay on the current definition version until they are applied or rejected.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Empty title="No proposals yet.">Stage an action from the workspace or the simulator.</Empty>
                </CardContent>
              </Card>
            ) : (
            <div className="workbench">
              <Card>
                <CardHeader>
                  <CardTitle>Proposals</CardTitle>
                  <CardDescription>Pending changes stay on the current definition version until they are applied or rejected.</CardDescription>
                </CardHeader>
                <CardContent>
                    <table className="data-table">
                      <thead><tr><th>Action</th><th>Request</th><th>Actor</th><th>Status</th></tr></thead>
                      <tbody>
                        {snapshot.changes.map(change => (
                          <tr key={change.id} aria-selected={change.id === selectedChangeId} tabIndex={0} onClick={() => setSelectedChangeId(change.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedChangeId(change.id) } }}>
                            <td><strong>{change.action}</strong><div className="muted">def v{change.definitionVersion} · rec v{change.recordVersion}</div></td>
                            <td>{recordTitle(snapshot.records.find(record => record.id === change.recordId))}</td>
                            <td><Badge variant={change.actorKind === 'agent' ? 'warning' : 'primary'}>{change.actorKind === 'agent' ? 'Simulator' : 'Human'}</Badge></td>
                            <td><Badge variant={statusVariant(change.status)}>{change.status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                </CardContent>
              </Card>
              <aside className="inspector">
                {selectedChange ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>{selectedChange.action}</CardTitle>
                      <CardDescription>{recordTitle(snapshot.records.find(record => record.id === selectedChange.recordId))} · {date(selectedChange.createdAt)}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="diff">
                        <div className="diff-col">
                          <h3>Before</h3>
                          <DiffValues data={selectedChange.before} />
                        </div>
                        <div className="diff-col">
                          <h3>After</h3>
                          <DiffValues data={selectedChange.after} />
                        </div>
                      </div>
                      <div>
                        {selectedChange.checks.map(check => (
                          <div className="check" key={check.id}>
                            <span>{check.label}<div className="muted">{check.message}</div></span>
                            <Badge variant={check.passed ? 'success' : 'danger'}>{check.passed ? 'Passed' : 'Failed'}</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                    {selectedChange.status === 'pending' ? (
                      <CardFooter>
                        <Button variant="destructive" disabled={busy} onPress={() => run('Proposal rejected.', async () => {
                          await request('/api/kernel', { type: 'review', changeId: selectedChange.id, decision: 'reject' })
                          await refresh()
                        })}>Reject</Button>
                        <Button disabled={busy} onPress={() => run('Proposal applied.', async () => {
                          await request('/api/kernel', { type: 'review', changeId: selectedChange.id, decision: 'apply' })
                          await refresh()
                        })}>{busy ? <Spinner data-icon="inline-start" /> : null}Apply</Button>
                      </CardFooter>
                    ) : null}
                  </Card>
                ) : <Empty title="Select a proposal to review the diff." />}
              </aside>
            </div>
            )
          ) : null}
          {view === 'capability' ? (
            <Tabs
              label="Capability"
              value={capabilityTab}
              onChange={setCapabilityTab}
              tabs={[
                { id: 'policies', label: 'Policies', panel: (
                  <Card>
                    <CardHeader>
                      <CardTitle>Policy configuration</CardTitle>
                      <CardDescription>Editing these settings publishes a new definition version. Existing proposals cannot silently adopt it.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        <Field>
                          <FieldLabel>Approval limit (USD)</FieldLabel>
                          <Input type="number" min={0.01} step={0.01} value={limitDollars} onChange={event => setLimitDollars(event.target.value)} />
                        </Field>
                        <Switch label="Require verified supplier" description="When enabled, approve is blocked unless the supplier is marked verified." checked={requireVerified} onChange={setRequireVerified} />
                      </FieldGroup>
                    </CardContent>
                    <CardFooter>
                      <Button disabled={busy} onPress={() => run('Published a new capability version.', async () => {
                        const cents = Math.round(Number(limitDollars) * 100)
                        await request('/api/kernel', { type: 'policies', expectedVersion: snapshot.capability.version, approvalLimitCents: cents, requireVerifiedSupplier: requireVerified })
                        await refresh()
                      })}>{busy ? <Spinner data-icon="inline-start" /> : null}Publish version {snapshot.capability.version + 1}</Button>
                    </CardFooter>
                  </Card>
                ) },
                { id: 'contracts', label: 'Contracts', panel: (
                  <div className="stack">
                    <Card>
                      <CardHeader>
                        <CardTitle>{definition.entity.label}</CardTitle>
                        <CardDescription>{definition.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <dl className="kv">
                          {Object.entries(definition.entity.fields).map(([key, field]) => (
                            <Fragment key={key}>
                              <dt>{field.label}</dt>
                              <dd>{field.type}{field.editable ? '' : ' · kernel-owned'}{field.required ? '' : ' · optional'}</dd>
                            </Fragment>
                          ))}
                        </dl>
                      </CardContent>
                    </Card>
                    {definition.actions.map(action => (
                      <Card key={action.name}>
                        <CardHeader>
                          <CardTitle>{action.label}</CardTitle>
                          <CardDescription>{action.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p className="muted">Roles: {action.roles.join(', ')}</p>
                          <p>Preconditions: {action.preconditions.map(rule => rule.label).join(', ') || 'None'}</p>
                          <p>Policies: {action.policies.map(rule => rule.label).join(', ') || 'None'}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) },
                { id: 'definition', label: 'Definition', panel: (
                  <Card>
                    <CardHeader>
                      <CardTitle>Versioned JSON definition</CardTitle>
                      <CardDescription>The evaluator consumes this contract. It has no procurement-specific branches.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <pre className="definition">{JSON.stringify(definition, null, 2)}</pre>
                    </CardContent>
                  </Card>
                ) },
              ]}
            />
          ) : null}
          {view === 'activity' ? (
            <Card>
              <CardHeader>
                <CardTitle>Execution history</CardTitle>
                <CardDescription>Append-only events written with the same transaction as the state change.</CardDescription>
              </CardHeader>
              <CardContent>
                {snapshot.executions.length === 0 ? <Empty title="No activity yet." /> : (
                  <div className="timeline">
                    {snapshot.executions.map(event => (
                      <div className="timeline-item" key={event.id}>
                        <span className="muted timeline-time">{date(event.createdAt)}</span>
                        <div>
                          <strong>{event.action}</strong>
                          <div className="muted">{event.actorName} · {event.actorKind === 'agent' ? 'simulator' : event.actorKind}{event.recordId ? ` · ${shortId(event.recordId)}` : ''}</div>
                        </div>
                        <Badge variant={statusVariant(event.outcome)}>{event.outcome}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
      </div>
      <CreateRequestDialog open={createOpen} busy={busy} onOpenChange={setCreateOpen} onCreate={data => run('Request created.', async () => {
        await request('/api/kernel', { type: 'create', data })
        setCreateOpen(false)
        await refresh()
      })} />
      <ActionDialog
        open={Boolean(actionName && selected)}
        actionName={actionName}
        record={selected}
        definition={definition}
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
          const next = await refresh()
          setSelectedChangeId(result.change?.id ?? next.changes[0]?.id)
          setView('review')
        })}
      />
    </>
  )
}

function CreateRequestDialog({ open, busy, onOpenChange, onCreate }: {
  open: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (data: Record<string, string | number | boolean>) => void
}) {
  const [category, setCategory] = useState('Office')
  const [verified, setVerified] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New purchase request" description="Validated against the current capability definition. Status is assigned by the kernel.">
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

function DiffValues({ data }: { data: RecordData }) {
  return (
    <dl className="kv">
      {Object.entries(data).map(([key, value]) => (
        <Fragment key={key}>
          <dt>{key}</dt>
          <dd>{key === 'amountCents' ? money(value) : String(value)}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

function ActionDialog({ open, actionName, record, definition, role, busy, onOpenChange, onSubmit }: {
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
        const input = Object.fromEntries([...values.entries()].map(([key, value]) => [key, String(value)]))
        onSubmit(action.name, input)
      }}>
        <FieldGroup>
          {preview && !preview.allowed ? <Alert variant="warning">This proposal will be blocked. Staging still records the failed checks.</Alert> : <Alert>This stages a change proposal. A human must apply it before the record changes.</Alert>}
          {Object.entries(action.input).map(([key, field]) => (
            <Field key={key} name={key} isRequired={field.required} minLength={field.min} maxLength={field.max}>
              <FieldLabel>{field.label}</FieldLabel>
              <Textarea />
              <FieldError />
            </Field>
          ))}
          <Button type="submit" disabled={busy}>{busy ? <Spinner data-icon="inline-start" /> : null}Stage proposal</Button>
        </FieldGroup>
      </Form>
    </Dialog>
  )
}

function LoadingShell() {
  return (
    <div className="loading-shell">
      <aside />
      <main>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </main>
    </div>
  )
}
