import { useEffect, useState } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { LoadingShell, ProjectFrame } from './project-frame'
import { Alert, Badge } from './ui/surfaces'
import { Button } from './ui/button'
import { authClient } from '@/lib/auth-client'
import { date, request, type Snapshot } from '@/lib/client'

type ActivityItem = { id: string; action: string; outcome: string; actorName: string; actorKind: string; createdAt: string; projectSlug: string | null; projectName: string | null; recordTitle: string | null }
type ActivityPage = { items: ActivityItem[]; nextCursor: string | null }
const words = (value: string) => value.replace(/[._]/g, ' ')
const actionLabel = (value: string) => ({ 'project.draft': 'Save application draft', 'project.publish': 'Publish application', 'capability.publish': 'Publish configuration', 'record.create': 'Create record' }[value] ?? words(value.split('.').at(-1) || value))

export function WorkspaceActivity() {
  const session = authClient.useSession()
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [page, setPage] = useState<ActivityPage>({ items: [], nextCursor: null })
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!session.data) return
    let active = true
    setBusy(true); setError('')
    Promise.all([request<Snapshot>('/api/kernel'), request<ActivityPage>('/api/kernel?activity=1')])
      .then(([next, activity]) => { if (active) { setSnapshot(next); setPage(activity) } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load activity.') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [session.data?.user.id, revision])
  async function loadMore() {
    if (!page.nextCursor || busy) return
    setBusy(true); setError('')
    try {
      const next = await request<ActivityPage>(`/api/kernel?activity=1&cursor=${encodeURIComponent(page.nextCursor)}`)
      setPage(current => ({ items: [...current.items, ...next.items.filter(item => !current.items.some(existing => existing.id === item.id))], nextCursor: next.nextCursor }))
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load older activity.') } finally { setBusy(false) }
  }
  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot) return error ? <main className="auth-page"><a href="/?workspace=default">Return to default workspace</a><Alert variant="danger">{error}</Alert><Button onPress={() => setRevision(value => value + 1)}>Try again</Button></main> : <LoadingShell />
  return <ProjectFrame snapshot={snapshot} workspace workspacePage="activity"><main className="main" id="main-content" tabIndex={-1}>
    <header className="main-header"><div><h1>Activity</h1><p>Recorded workspace actions, newest first.</p></div><Button variant="outline" disabled={busy} onPress={() => setRevision(value => value + 1)}>{busy ? 'Loading…' : 'Refresh'}</Button></header>
    <div className="main-body workspace-home-body" aria-busy={busy}>
      {error ? <Alert variant="danger">{error} Previously loaded activity is still shown.</Alert> : null}
      <section className="stack" aria-label="Workspace activity">
        {!page.items.length && !busy && !error ? <p className="muted">No activity yet. Recorded actions will appear here as your team works.</p> : null}
        {page.items.map(item => <article key={item.id} className="inbox-row"><div><p className="muted">{date(item.createdAt)} · {item.actorName}{item.actorKind === 'agent' ? ' · Agent' : ''}</p><h2 className="activity-action">{actionLabel(item.action)}</h2><p>{item.projectName ?? 'Workspace'}{item.recordTitle ? ` · ${item.recordTitle}` : ''}</p><Badge>{words(item.outcome)}</Badge></div>{item.projectSlug ? <Link className="inbox-open" to="/p/$projectSlug" params={{ projectSlug: item.projectSlug }}>Open application</Link> : null}</article>)}
      </section>
      {page.nextCursor ? <Button variant="outline" disabled={busy} onPress={loadMore}>Load older activity</Button> : page.items.length ? <p className="muted">You’ve reached the beginning of recorded activity.</p> : null}
    </div>
  </main></ProjectFrame>
}
