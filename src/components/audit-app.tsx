import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { ActionDialog, CreateEntityDialog, PendingApply, RecordFields } from '@/components/kernel-dialogs'
import { LoadingShell, ProjectFrame } from '@/components/project-frame'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Separator, Spinner, ToggleGroup } from '@/components/ui/surfaces'
import { request, type ActionResult } from '@/lib/client'
import { actionAvailable, capabilityOf, idempotencyKey, isOverdue, pendingFor, severityVariant, statusLabel, statusVariant } from '@/lib/project-ui'
import { useProject } from '@/lib/use-project'

export function AuditApp({ projectSlug }: { projectSlug: string }) {
  const { session, snapshot, error, busy, run, refresh, keys } = useProject(projectSlug)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [actionName, setActionName] = useState<string>()

  const records = useMemo(() => {
    if (!snapshot) return []
    const needle = query.trim().toLowerCase()
    return snapshot.records.filter(record => {
      const pending = pendingFor(snapshot, record.id)
      const overdue = isOverdue(record.data)
      const matchesStatus = status === 'all'
        || (status === 'pending' ? Boolean(pending) : status === 'overdue' ? overdue : record.data.status === status)
      const haystack = Object.values(record.data).join(' ').toLowerCase()
      return matchesStatus && (!needle || haystack.includes(needle))
    })
  }, [query, snapshot, status])

  useEffect(() => {
    if (records.length === 0) {
      setSelectedId(current => current === undefined ? current : undefined)
      return
    }
    if (!records.some(record => record.id === selectedId)) setSelectedId(records[0].id)
  }, [records, selectedId])

  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot) {
    return error
      ? <main className="auth-page"><Alert variant="danger">{error}</Alert><p><Link to="/">Back to projects</Link></p></main>
      : <LoadingShell />
  }

  const definition = (capabilityOf(snapshot, 'audit') ?? snapshot.capability).definition
  const selected = snapshot.records.find(record => record.id === selectedId)
  const pending = selected ? pendingFor(snapshot, selected.id) : undefined
  const selectedActions = selected
    ? definition.actions.filter(action => !pending && actionAvailable(definition, selected, action.name, snapshot.principal.role))
    : []
  const pendingCount = snapshot.changes.filter(change => change.status === 'pending').length
  const canReview = definition.reviewerRoles.includes(snapshot.principal.role)
  const openCount = snapshot.records.filter(record => record.data.status === 'open' || record.data.status === 'remediating').length
  const overdueCount = snapshot.records.filter(record => isOverdue(record.data)).length
  const awaitingCount = snapshot.records.filter(record => record.data.status === 'open' && record.data.assessed !== true).length
  const closedCount = snapshot.records.filter(record => record.data.status === 'closed').length

  return (
    <>
      <Toaster position="top-right" />
      <ProjectFrame snapshot={snapshot}>
        <main className="main" id="main-content" tabIndex={-1}>
          <header className="main-header">
            <div>
              <h1>Audit findings</h1>
              <p>Record evidence, stage an assessment, then remediate or close. Assessments are kernel actions, not a live model.</p>
            </div>
            <Button onPress={() => setCreateOpen(true)}><Plus data-icon="inline-start" />New finding</Button>
          </header>
          <div className="main-body desk-legacy-body">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            <div className="register">
              <div className="register-stat"><strong>{openCount}</strong><span>Open</span></div>
              <div className="register-stat"><strong>{overdueCount}</strong><span>Overdue</span></div>
              <div className="register-stat"><strong>{awaitingCount}</strong><span>Awaiting assessment</span></div>
              <div className="register-stat"><strong>{closedCount}</strong><span>Closed</span></div>
            </div>
            <div className="toolbar">
              <Field value={query} onChange={setQuery}>
                <FieldLabel>Search</FieldLabel>
                <Input placeholder="Issue number or finding" />
              </Field>
              <ToggleGroup
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'draft', label: 'Draft' },
                  { value: 'open', label: 'Open' },
                  { value: 'remediating', label: 'Remediating' },
                  { value: 'closed', label: 'Closed' },
                  { value: 'waived', label: 'Waived' },
                  { value: 'overdue', label: `Overdue · ${overdueCount}` },
                  ...(pendingCount ? [{ value: 'pending', label: `Pending · ${pendingCount}` }] : []),
                ]}
              />
            </div>
            <div className="workbench desk-workbench">
              <Card>
                <CardHeader>
                  <CardTitle>Register</CardTitle>
                  <CardDescription>{`${records.length} finding${records.length === 1 ? '' : 's'}`}</CardDescription>
                </CardHeader>
                <CardContent>
                  {records.length === 0 ? <Empty title="No findings match these filters." /> : (
                    <div className="table-scroll" role="region" aria-label="Record queue" tabIndex={0}><table className="data-table">
                      <thead>
                        <tr>
                          <th>Finding</th>
                          <th>Severity</th>
                          <th>Area</th>
                          <th>Due</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map(record => {
                          const overdue = isOverdue(record.data)
                          return (
                            <tr key={record.id} data-selected={record.id === selectedId} onClick={() => setSelectedId(record.id)}>
                              <td>
                                <Button variant="link" className="record-select" aria-pressed={record.id === selectedId} onPress={() => setSelectedId(record.id)}>{String(record.data.title)}</Button>
                                <div className="muted">{String(record.data.code)}{record.data.source === 'Agent' ? ' · agent' : ''}{pendingFor(snapshot, record.id) ? ' · pending' : ''}</div>
                              </td>
                              <td><Badge variant={severityVariant(String(record.data.severity))}>{String(record.data.severity)}</Badge></td>
                              <td>{String(record.data.area)}</td>
                              <td>
                                {String(record.data.due)}
                                {overdue ? <div className="muted">overdue</div> : null}
                              </td>
                              <td className="status"><Badge variant={statusVariant(String(record.data.status))}>{statusLabel(String(record.data.status))}</Badge></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table></div>
                  )}
                </CardContent>
              </Card>
              <aside className="inspector desk-inspector">
                {selected ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>{String(selected.data.title)}</CardTitle>
                      <CardDescription>{String(selected.data.code)} · {String(selected.data.area)}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RecordFields definition={definition} data={selected.data} />
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
                            {selectedActions.length === 0 ? <p className="muted">Nothing to do on this finding.</p> : selectedActions.map(action => (
                              <Button key={action.name} variant={action.name === 'waive' ? 'destructive' : 'default'} onPress={() => setActionName(action.name)}>{action.label}</Button>
                            ))}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ) : <Empty title="Select a finding." />}
              </aside>
            </div>
          </div>
        </main>
      </ProjectFrame>
      <CreateEntityDialog error={error} open={createOpen} definition={definition} busy={busy} onOpenChange={setCreateOpen} onCreate={data => run('Finding created.', async () => {
        await request('/api/kernel', { type: 'create', capability: 'audit', data })
        setCreateOpen(false)
        await refresh()
      })} />
      <ActionDialog
        error={error}
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
          await refresh()
        })}
      />
    </>
  )
}
