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
import type { Definition, Field as EntityField, RecordData } from '@/kernel/definition'
import { money, request, type ActionResult } from '@/lib/client'
import { actionAvailable, capabilityOf, idempotencyKey, pendingFor, statusLabel, statusVariant } from '@/lib/project-ui'
import { useProject } from '@/lib/use-project'

const destructive = new Set(['lose', 'retire', 'offboard', 'decline'])

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
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [actionName, setActionName] = useState<string>()

  const capability = snapshot
    ? (snapshot.project ? capabilityOf(snapshot, snapshot.project.packages[0] ?? '') : undefined) ?? snapshot.capability
    : undefined
  const definition = capability?.definition
  const records = useMemo(() => {
    if (!snapshot || !definition) return []
    const needle = query.trim().toLowerCase()
    return snapshot.records.filter(record => {
      const pending = pendingFor(snapshot, record.id)
      const matchesStatus = status === 'all' || (status === 'pending' ? Boolean(pending) : record.data.status === status)
      const haystack = Object.values(record.data).join(' ').toLowerCase()
      return matchesStatus && (!needle || haystack.includes(needle))
    })
  }, [definition, query, snapshot, status])

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

  const selected = snapshot.records.find(record => record.id === selectedId)
  const pending = selected ? pendingFor(snapshot, selected.id) : undefined
  const selectedActions = selected
    ? definition.actions.filter(action => !pending && actionAvailable(definition, selected, action.name, snapshot.principal.role))
    : []
  const pendingCount = snapshot.changes.filter(change => change.status === 'pending').length
  const canReview = definition.reviewerRoles.includes(snapshot.principal.role)
  const columns = extraColumns(definition)
  const statuses = definition.entity.fields.status?.options ?? []
  const noun = definition.entity.label.toLowerCase()
  const nouns = plural(noun)

  return (
    <>
      <Toaster position="top-right" />
      <ProjectFrame snapshot={snapshot}>
        <div className="main">
          <header className="main-header">
            <div>
              <h1>{plural(definition.entity.label)}</h1>
              <p>{definition.description}</p>
            </div>
            <Button onPress={() => setCreateOpen(true)}><Plus data-icon="inline-start" />New {noun}</Button>
          </header>
          <div className="main-body">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            <div className="toolbar">
              <Field value={query} onChange={setQuery}>
                <FieldLabel>Search</FieldLabel>
                <Input placeholder={`Title or ${noun}`} />
              </Field>
              <ToggleGroup
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: 'All' },
                  ...statuses.map(value => ({ value, label: statusLabel(value) })),
                  ...(pendingCount ? [{ value: 'pending', label: `Pending · ${pendingCount}` }] : []),
                ]}
              />
            </div>
            <div className="workbench">
              <Card>
                <CardHeader>
                  <CardTitle>Queue</CardTitle>
                  <CardDescription>{`${records.length} ${records.length === 1 ? noun : nouns}`}</CardDescription>
                </CardHeader>
                <CardContent>
                  {records.length === 0 ? <Empty title={`No ${nouns} match these filters.`} /> : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{definition.entity.label}</th>
                          {columns.map(([key, field]) => (
                            <th key={key} className={key === 'amountCents' ? 'numeric' : undefined}>{key === 'amountCents' ? 'Amount' : field.label}</th>
                          ))}
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map(record => (
                          <tr key={record.id} aria-selected={record.id === selectedId} tabIndex={0} onClick={() => setSelectedId(record.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(record.id) } }}>
                            <td>
                              <strong>{String(record.data.title)}</strong>
                              <div className="muted">{pendingFor(snapshot, record.id) ? 'pending' : ''}</div>
                            </td>
                            {columns.map(([key, field]) => (
                              <td key={key} className={key === 'amountCents' ? 'numeric' : undefined}>{cell(key, field, record.data)}</td>
                            ))}
                            <td className="status"><Badge variant={statusVariant(String(record.data.status))}>{statusLabel(String(record.data.status))}</Badge></td>
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
                      <CardDescription>{definition.entity.label}</CardDescription>
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
                            {selectedActions.length === 0 ? <p className="muted">Nothing to do on this {noun}.</p> : selectedActions.map(action => (
                              <Button key={action.name} variant={destructive.has(action.name) ? 'destructive' : 'default'} onPress={() => setActionName(action.name)}>{action.label}</Button>
                            ))}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ) : <Empty title={`Select a ${noun}.`} />}
              </aside>
            </div>
          </div>
        </div>
      </ProjectFrame>
      <CreateEntityDialog open={createOpen} definition={definition} busy={busy} onOpenChange={setCreateOpen} onCreate={data => run(`${definition.entity.label} created.`, async () => {
        await request('/api/kernel', { type: 'create', capability: definition.slug, data })
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
