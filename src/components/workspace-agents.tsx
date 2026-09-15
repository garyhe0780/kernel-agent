import { useEffect, useState } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { LoadingShell, ProjectFrame } from './project-frame'
import { Alert, Badge } from './ui/surfaces'
import { Button } from './ui/button'
import { authClient } from '@/lib/auth-client'
import { date, request, type Snapshot } from '@/lib/client'

type Connection = { id: string; name: string; projectSlug: string | null; projectName: string; expiresAt: string; actionCount: number; state: string }
export function WorkspaceAgents() {
  const session = authClient.useSession()
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [connections, setConnections] = useState<Connection[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!session.data) return
    let active = true
    setBusy(true); setError('')
    request<Snapshot>('/api/kernel').then(async next => {
      if (!active) return
      setSnapshot(next)
      if (next.principal.role === 'owner') {
        const items = await request<Connection[]>('/api/kernel?workspaceAgents=1')
        if (active) setConnections(items)
      }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load agent connections.') }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [session.data?.user.id, revision])
  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot) return error ? <main className="auth-page"><a href="/?workspace=default">Return to default workspace</a><Alert variant="danger">{error}</Alert><Button onPress={() => setRevision(value => value + 1)}>Try again</Button></main> : <LoadingShell />
  return <ProjectFrame snapshot={snapshot} workspace workspacePage="agents"><main className="main" id="main-content" tabIndex={-1}>
    <header className="main-header"><div><h1>Agents</h1><p>External agent connections and the applications they can access.</p></div><Button variant="outline" disabled={busy} onPress={() => setRevision(value => value + 1)}>{busy ? 'Loading…' : 'Refresh'}</Button></header>
    <div className="main-body workspace-home-body" aria-busy={busy}>
      {snapshot.principal.role !== 'owner' ? <Alert>Only a workspace owner can manage agent access.</Alert> : <>
        {error ? <Alert variant="danger">{error} Refresh to reload connection status.</Alert> : null}
        <section className="stack" aria-label="Agent connections"><h2>Connected agents</h2><p className="muted">Each connection can read one application and propose only its permitted actions. Find pending proposals in Inbox, then open their application to review them. Status reflects the last refresh.</p>
          {!busy && !error && !connections.length ? <p>No external agents are connected yet. Choose an application below to configure access.</p> : null}
          {connections.map(item => <article className="inbox-row" key={item.id}><div><h3>{item.name}</h3><p>{item.projectName} · {item.actionCount} permitted {item.actionCount === 1 ? 'action' : 'actions'}</p><p className="muted">Expires {date(item.expiresAt)}</p><Badge>{item.state}</Badge></div>{item.projectSlug ? <Link className="inbox-open" to="/p/$projectSlug/build" params={{ projectSlug: item.projectSlug }}>Manage in application</Link> : null}</article>)}
        </section>
        <section className="stack" aria-label="Application agent access"><h2>Connect an agent</h2><p className="muted">Choose an application, then open Agents in its configuration to select actions and issue a credential.</p>{snapshot.projects.map(project => <Link className="overview-application-row" key={project.slug} to="/p/$projectSlug/build" params={{ projectSlug: project.slug }}><strong>{project.name}</strong><span>Configure access</span></Link>)}{!snapshot.projects.length ? <p>Create and publish an application before connecting an agent.</p> : null}</section>
      </>}
    </div>
  </main></ProjectFrame>
}
