import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useWorkspaceSnapshot } from './workspace-layout'
import { Alert, Badge } from './ui/surfaces'
import { Button } from './ui/button'
import { date, request } from '@/lib/client'
import { statusLabel } from '@/lib/project-ui'
import { WorkspaceActionLink, WorkspaceEntityCard } from './workspace-entity-card'

type InboxItem = { id: string; projectSlug: string | null; projectName: string; title: string; action: string; actorKind: string; createdAt: string; stale: boolean }

export function WorkspaceInbox() {
  const snapshot = useWorkspaceSnapshot()
  const [items, setItems] = useState<InboxItem[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const owner = snapshot.principal.role === 'owner'
  useEffect(() => {
    let active = true
    setBusy(true); setError('')
    request<InboxItem[]>('/api/kernel?inbox=1')
      .then(pending => { if (active) setItems(pending) })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load pending approvals.') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [snapshot.principal.userId, revision])
  return <main className="main" id="main-content" tabIndex={-1}>
    <header className="main-header"><div><h1>Inbox</h1><p>Pending approvals across your applications, oldest first.</p></div><Button variant="ghost" size="icon" aria-label={busy ? 'Refreshing inbox' : 'Refresh inbox'} isDisabled={busy} onPress={() => setRevision(value => value + 1)}><RefreshCw data-icon="inline-start" /></Button></header>
    <div className="main-body workspace-home-body" aria-busy={busy}>
      {error ? <Alert variant="danger">{error} The list may be out of date. Refresh to try again.</Alert> : null}
      {snapshot.principal.role !== 'owner' ? <p className="muted">An owner reviews and applies these proposals. Open an application to see the details.</p> : null}
      <section className="stack" aria-label="Pending approvals"><h2>{items.length} pending {items.length === 1 ? 'approval' : 'approvals'}</h2>
        {!items.length && !busy && !error ? <p className="muted">You’re all caught up. New proposals will appear here when they’re ready for review.</p> : null}
        {items.map(item => <WorkspaceEntityCard
          key={item.id}
          title={item.title}
          description={`${item.projectName} · ${date(item.createdAt)}`}
          badge={<Badge variant="primary">Open</Badge>}
          actions={item.projectSlug ? <>
            {owner ? <WorkspaceActionLink variant="primary" to="/p/$projectSlug" params={{ projectSlug: item.projectSlug }}>Review / Approve</WorkspaceActionLink> : null}
            <WorkspaceActionLink variant={owner ? 'outline' : 'primary'} to="/p/$projectSlug" params={{ projectSlug: item.projectSlug }}>View</WorkspaceActionLink>
          </> : <span className="muted">Application unavailable</span>}
        >
          <p>{statusLabel(item.action)} · Proposed by {item.actorKind === 'agent' ? 'an agent' : 'a team member'}</p>
          {item.stale ? <p className="muted">The record changed or is unavailable. Review the proposal’s current state in the application.</p> : null}
        </WorkspaceEntityCard>)}
      </section>
    </div>
  </main>
}
