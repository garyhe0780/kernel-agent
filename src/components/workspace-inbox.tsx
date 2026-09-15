import { useEffect, useState } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { LoadingShell, ProjectFrame } from './project-frame'
import { Alert } from './ui/surfaces'
import { Button } from './ui/button'
import { authClient } from '@/lib/auth-client'
import { date, request, type Snapshot } from '@/lib/client'

type InboxItem = { id: string; projectSlug: string | null; projectName: string; title: string; action: string; actorKind: string; createdAt: string; stale: boolean }

export function WorkspaceInbox() {
  const session = authClient.useSession()
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [items, setItems] = useState<InboxItem[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!session.data) return
    let active = true
    setBusy(true); setError('')
    Promise.all([request<Snapshot>('/api/kernel'), request<InboxItem[]>('/api/kernel?inbox=1')])
      .then(([next, pending]) => { if (active) { setSnapshot(next); setItems(pending) } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load pending approvals.') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [session.data?.user.id, revision])
  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot) return error ? <main className="auth-page"><a href="/?workspace=default">Return to default workspace</a><Alert variant="danger">{error}</Alert><Button onPress={() => setRevision(value => value + 1)}>Try again</Button></main> : <LoadingShell />
  return <ProjectFrame snapshot={snapshot} workspace workspacePage="inbox"><main className="main" id="main-content" tabIndex={-1}>
    <header className="main-header"><div><h1>Inbox</h1><p>Pending approvals across your applications, oldest first.</p></div><Button variant="outline" disabled={busy} onPress={() => setRevision(value => value + 1)}>{busy ? 'Refreshing…' : 'Refresh'}</Button></header>
    <div className="main-body workspace-home-body" aria-busy={busy}>
      {error ? <Alert variant="danger">{error} The list may be out of date. Refresh to try again.</Alert> : null}
      {snapshot.principal.role !== 'owner' ? <p className="muted">An owner reviews and applies these proposals. Open an application to see the details.</p> : null}
      <section className="stack" aria-label="Pending approvals"><h2>{items.length} pending {items.length === 1 ? 'approval' : 'approvals'}</h2>
        {!items.length && !busy && !error ? <p className="muted">You’re all caught up. New proposals will appear here when they’re ready for review.</p> : null}
        {items.map(item => <article key={item.id} className="inbox-row"><div><p className="muted">{item.projectName} · {date(item.createdAt)}</p><h3>{item.title}</h3><p>{item.action} · Proposed by {item.actorKind === 'agent' ? 'an agent' : 'a team member'}</p>{item.stale ? <p className="muted">The record changed or is unavailable. Review the proposal’s current state in the application.</p> : null}</div>{item.projectSlug ? <Link className="inbox-open" to="/p/$projectSlug" params={{ projectSlug: item.projectSlug }}>Open application</Link> : <span className="muted">Application unavailable</span>}</article>)}
      </section>
    </div>
  </main></ProjectFrame>
}
