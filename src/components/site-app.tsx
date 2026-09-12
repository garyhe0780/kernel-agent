import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Toaster } from 'sonner'
import { ActionDialog, CreateEntityDialog } from '@/components/kernel-dialogs'
import { LoadingShell, ProjectFrame } from '@/components/project-frame'
import { Button } from '@/components/ui/button'
import { Alert, Badge, Spinner } from '@/components/ui/surfaces'
import { composeEditorial } from '@/kernel/packages'
import { date, request, type ActionResult } from '@/lib/client'
import type { PublicRecord } from '@/kernel/packages'
import { actionAvailable, capabilityOf, idempotencyKey, pendingFor, statusVariant } from '@/lib/project-ui'
import { useProject } from '@/lib/use-project'

export function SiteApp({ projectSlug }: { projectSlug: string }) {
  const { session, snapshot, error, busy, run, refresh, keys } = useProject(projectSlug)
  const [selectedId, setSelectedId] = useState<string>()
  const [createSlug, setCreateSlug] = useState<'site' | 'blog'>()
  const [actionName, setActionName] = useState<string>()

  const blocks = useMemo(() => {
    if (!snapshot) return []
    return composeEditorial(snapshot.records, snapshot.catalog)
  }, [snapshot])

  useEffect(() => {
    if (!snapshot) return
    if (selectedId && snapshot.records.some(record => record.id === selectedId)) return
    const first = blocks.flatMap(block => block.records)[0]
    setSelectedId(first?.id)
  }, [blocks, selectedId, snapshot])

  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot) {
    return error
      ? <main className="auth-page"><Alert variant="danger">{error}</Alert><p><Link to="/">Back to projects</Link></p></main>
      : <LoadingShell />
  }

  const selected = snapshot.records.find(record => record.id === selectedId)
  const selectedCap = selected ? capabilityOf(snapshot, selected.capability) : undefined
  const definition = selectedCap?.definition ?? snapshot.capability.definition
  const pending = selected ? pendingFor(snapshot, selected.id) : undefined
  const selectedActions = selected && selectedCap
    ? selectedCap.definition.actions.filter(action => !pending && actionAvailable(selectedCap.definition, selected, action.name, snapshot.principal.role))
    : []
  const canReview = definition.reviewerRoles.includes(snapshot.principal.role)
  const createDefinition = createSlug ? capabilityOf(snapshot, createSlug)?.definition : undefined

  return (
    <>
      <Toaster position="top-right" />
      <ProjectFrame snapshot={snapshot} liveHref={`/s/${snapshot.workspace.id}`}>
        <div className="main">
          <header className="main-header">
            <div>
              <h1>Journal</h1>
              <p>Drafts stay here. Publish makes them live.</p>
            </div>
            <div className="header-actions">
              <Button variant="outline" onPress={() => setCreateSlug('site')}><Plus data-icon="inline-start" />New page</Button>
              <Button onPress={() => setCreateSlug('blog')}><Plus data-icon="inline-start" />New note</Button>
            </div>
          </header>
          <div className="main-body">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            <div className="editorial">
              {blocks.every(block => block.records.length === 0) ? (
                <p className="journal-empty">No pages or notes yet. Create a page or a note to start the journal.</p>
              ) : blocks.map(block => (
                <section key={block.slug} className="journal-block">
                  {block.view === 'hero' ? block.records.map(record => (
                    <JournalPiece
                      key={record.id}
                      record={record}
                      kind="hero"
                      selected={record.id === selectedId}
                      pending={Boolean(pendingFor(snapshot, record.id))}
                      onSelect={() => setSelectedId(record.id)}
                    />
                  )) : (
                    <div className="journal-notes">
                      {block.records.map(record => (
                        <JournalPiece
                          key={record.id}
                          record={record}
                          kind="note"
                          selected={record.id === selectedId}
                          pending={Boolean(pendingFor(snapshot, record.id))}
                          onSelect={() => setSelectedId(record.id)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))}
              {selected ? (
                <div className="editorial-actions">
                  {pending ? (
                    <>
                      <Badge variant="warning">Pending · {pending.action}</Badge>
                      {canReview ? (
                        <>
                          <Button variant="destructive" disabled={busy} onPress={() => run('Proposal rejected.', async () => {
                            await request('/api/kernel', { type: 'review', changeId: pending.id, decision: 'reject' })
                            await refresh()
                          })}>Reject</Button>
                          <Button disabled={busy} onPress={() => run('Proposal applied.', async () => {
                            await request('/api/kernel', { type: 'review', changeId: pending.id, decision: 'apply' })
                            await refresh()
                          })}>{busy ? <Spinner data-icon="inline-start" /> : null}Apply</Button>
                        </>
                      ) : <p className="muted">An owner must apply this change.</p>}
                    </>
                  ) : selectedActions.length === 0 ? (
                    <p className="muted">Nothing to do on this {selected.capability === 'site' ? 'page' : 'note'}.</p>
                  ) : selectedActions.map(action => (
                    <Button key={action.name} variant={action.name === 'unpublish' ? 'destructive' : 'default'} onPress={() => setActionName(action.name)}>{action.label}</Button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </ProjectFrame>
      {createDefinition && createSlug ? (
        <CreateEntityDialog
          open
          definition={createDefinition}
          busy={busy}
          onOpenChange={open => { if (!open) setCreateSlug(undefined) }}
          onCreate={data => run(`${createDefinition.entity.label} created.`, async () => {
            await request('/api/kernel', { type: 'create', capability: createSlug, data })
            setCreateSlug(undefined)
            await refresh()
          })}
        />
      ) : null}
      <ActionDialog
        open={Boolean(actionName && selected && selectedCap)}
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

function JournalPiece({ record, kind, selected, pending, onSelect }: {
  record: PublicRecord
  kind: 'hero' | 'note'
  selected: boolean
  pending: boolean
  onSelect: () => void
}) {
  const draft = String(record.data.status) !== 'published'
  const created = String(record.createdAt)
  return (
    <article
      className={kind === 'hero' ? 'journal-hero journal-piece' : 'journal-note journal-piece'}
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect() } }}
    >
      <div className="journal-piece-meta">
        {kind === 'note' ? <time dateTime={created}>{date(created)}</time> : null}
        {draft ? <Badge variant="warning">Draft</Badge> : <Badge variant="success">Live</Badge>}
        {pending ? <Badge variant="warning">Pending</Badge> : null}
      </div>
      {kind === 'hero' ? (
        <>
          <h2>{String(record.data.title)}</h2>
          <p className="journal-standfirst">{String(record.data.standfirst)}</p>
          <p>{String(record.data.body)}</p>
        </>
      ) : (
        <>
          <h2>{String(record.data.title)}</h2>
          <p className="journal-excerpt">{String(record.data.excerpt)}</p>
          <p>{String(record.data.body)}</p>
        </>
      )}
    </article>
  )
}
