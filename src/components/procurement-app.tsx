import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { ActionDialog, CreateRequestDialog, PendingApply, RecordFields } from '@/components/kernel-dialogs'
import { LoadingShell, ProjectFrame } from '@/components/project-frame'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Separator, Spinner, ToggleGroup } from '@/components/ui/surfaces'
import { money, request, type ActionResult } from '@/lib/client'
import { actionAvailable, capabilityOf, idempotencyKey, pendingFor, statusVariant } from '@/lib/project-ui'
import { useProject } from '@/lib/use-project'

export function ProcurementApp({ projectSlug }: { projectSlug: string }) {
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
      const data = record.data
      const pending = pendingFor(snapshot, record.id)
      const matchesStatus = status === 'all' || (status === 'pending' ? Boolean(pending) : data.status === status)
      const haystack = `${data.title} ${data.supplier ?? ''} ${data.category ?? ''}`.toLowerCase()
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

  const definition = (capabilityOf(snapshot, 'procurement') ?? snapshot.capability).definition
  const selected = snapshot.records.find(record => record.id === selectedId)
  const pending = selected ? pendingFor(snapshot, selected.id) : undefined
  const selectedActions = selected
    ? definition.actions.filter(action => !pending && actionAvailable(definition, selected, action.name, snapshot.principal.role))
    : []
  const pendingCount = snapshot.changes.filter(change => change.status === 'pending').length
  const canReview = definition.reviewerRoles.includes(snapshot.principal.role)

  return (
    <>
      <Toaster position="top-right" />
      <ProjectFrame snapshot={snapshot}>
        <div className="main">
          <header className="main-header">
            <div>
              <h1>Purchase requests</h1>
              <p>Submit a draft for review, then approve or decline it.</p>
            </div>
            <Button onPress={() => setCreateOpen(true)}><Plus data-icon="inline-start" />New request</Button>
          </header>
          <div className="main-body">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            <div className="toolbar">
              <Field value={query} onChange={setQuery}>
                <FieldLabel>Search</FieldLabel>
                <Input placeholder="Title or supplier" />
              </Field>
              <ToggleGroup
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'draft', label: 'Draft' },
                  { value: 'submitted', label: 'Submitted' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'declined', label: 'Declined' },
                  ...(pendingCount ? [{ value: 'pending', label: `Pending · ${pendingCount}` }] : []),
                ]}
              />
            </div>
            <div className="workbench">
              <Card>
                <CardHeader>
                  <CardTitle>Queue</CardTitle>
                  <CardDescription>{`${records.length} request${records.length === 1 ? '' : 's'}`}</CardDescription>
                </CardHeader>
                <CardContent>
                  {records.length === 0 ? <Empty title="No requests match these filters." /> : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Request</th>
                          <th>Supplier</th>
                          <th className="numeric">Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map(record => (
                          <tr key={record.id} aria-selected={record.id === selectedId} tabIndex={0} onClick={() => setSelectedId(record.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(record.id) } }}>
                            <td>
                              <strong>{String(record.data.title)}</strong>
                              <div className="muted">{record.data.category ? String(record.data.category) : ''}{pendingFor(snapshot, record.id) ? ' · pending' : ''}</div>
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
                      <CardDescription>{String(selected.data.supplier)}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RecordFields definition={definition} data={selected.data} />
                      {pending ? (
                        <PendingApply
                          record={selected}
                          action={pending.action}
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
                            {selectedActions.length === 0 ? <p className="muted">Nothing to do on this request.</p> : selectedActions.map(action => (
                              <Button key={action.name} variant={action.name === 'decline' ? 'destructive' : 'default'} onPress={() => setActionName(action.name)}>{action.label}</Button>
                            ))}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ) : <Empty title="Select a request." />}
              </aside>
            </div>
          </div>
        </div>
      </ProjectFrame>
      <CreateRequestDialog open={createOpen} busy={busy} onOpenChange={setCreateOpen} onCreate={data => run('Request created.', async () => {
        await request('/api/kernel', { type: 'create', capability: 'procurement', data })
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
          await refresh()
        })}
      />
    </>
  )
}
