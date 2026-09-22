import { useEffect, useRef, useState } from 'react'
import { useWorkspaceSnapshot } from './workspace-layout'
import { Alert, Badge, Spinner } from './ui/surfaces'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, Form } from './ui/form-field'
import { Input } from './ui/input'
import { date, request } from '@/lib/client'
import { statusVariant } from '@/lib/project-ui'
import { WorkspaceActionLink, WorkspaceEntityCard } from './workspace-entity-card'

type Connection = { id: string; name: string; kind: 'operate' | 'construct'; projectSlug: string | null; projectName: string; expiresAt: string; actionCount: number; state: string }
type Issued = { token: string; credential: { id: string; name: string } }

export function WorkspaceAgents() {
  const snapshot = useWorkspaceSnapshot()
  const [connections, setConnections] = useState<Connection[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [connectOpen, setConnectOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<Connection>()
  const [secret, setSecret] = useState<Issued>()
  const secretField = useRef<HTMLInputElement>(null)
  const owner = snapshot.principal.role === 'owner'
  useEffect(() => { if (secret) secretField.current?.focus() }, [secret])
  useEffect(() => {
    let active = true
    setBusy(true); setError('')
    if (!owner) {
      setBusy(false)
      return
    }
    request<Connection[]>('/api/kernel?workspaceAgents=1').then(items => { if (active) setConnections(items) }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load agent connections.') }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [snapshot.principal.userId, snapshot.principal.role, owner, revision])
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await work() } catch (e) { setError(e instanceof Error ? e.message : 'The request failed. Try again.') } finally { setBusy(false) }
  }
  function closeConnect(open: boolean) {
    if (open) { setConnectOpen(true); return }
    setConnectOpen(false); setSecret(undefined)
  }
  const mcpUrl = typeof window === 'undefined' ? '/api/mcp' : `${window.location.origin}/api/mcp`
  return <main className="main" id="main-content" tabIndex={-1}>
    <header className="main-header"><div><h1>Agents</h1><p>Connect Cursor, Claude, or another MCP client. Builder credentials create applications; application credentials propose record changes for review.</p></div><div className="builder-actions"><Button variant="outline" disabled={busy} onPress={() => setRevision(value => value + 1)}>{busy ? 'Loading…' : 'Refresh'}</Button>{owner ? <Button disabled={busy || Boolean(secret)} onPress={() => setConnectOpen(true)}>Connect a builder</Button> : null}</div></header>
    <Dialog open={connectOpen} onOpenChange={closeConnect} title={secret ? `Save ${secret.credential.name}’s credential` : 'Connect a builder'} description={secret ? 'The secret is shown once. Store it in your agent’s header configuration before closing this dialog.' : 'Issues a workspace credential that can save and publish application drafts over MCP. It cannot read records or stage operational changes.'}>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {notice && connectOpen ? <Alert>{notice}</Alert> : null}
      {secret ? <FieldGroup>
        <Field isReadOnly value={secret.token}><FieldLabel>Agent credential</FieldLabel><Input ref={secretField} autoComplete="off" /></Field>
        <Field isReadOnly value={mcpUrl}><FieldLabel>MCP URL</FieldLabel><Input /></Field>
        <p>Use Streamable HTTP. Set <code>Authorization: Bearer</code> to the credential. Clients must support a configured bearer header; OAuth sign-in is not available. Call <code>list_patterns</code> and prefer <code>save_draft</code> with a pattern id, then <code>publish_draft</code>. Publishing does not install sample records.</p>
        <div className="builder-actions">
          <Button variant="outline" onPress={() => void run(async () => { await navigator.clipboard.writeText(secret.token); setNotice('Credential copied.') })}>Copy credential</Button>
          <Button variant="outline" disabled={busy} onPress={() => void run(async () => {
            const response = await fetch(mcpUrl, { method: 'POST', credentials: 'omit', headers: { Authorization: `Bearer ${secret.token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
            const value = await response.json() as { result?: { tools?: { name: string }[] }; error?: { message?: string } }
            if (!response.ok || value.error) throw new Error(value.error?.message || 'MCP connection failed.')
            const names = (value.result?.tools ?? []).map(tool => tool.name)
            if (!names.includes('save_draft')) throw new Error('This credential did not expose construction tools.')
            setNotice(`MCP verified. ${names.length} construction tools available, including save_draft and publish_draft.`)
          })}>Test MCP connection</Button>
          <Button variant="secondary" onPress={() => closeConnect(false)}>I saved the credential</Button>
        </div>
      </FieldGroup> : <Form onSubmit={event => {
        event.preventDefault()
        const form = event.currentTarget
        const values = new FormData(form)
        void run(async () => {
          const result = await request<Issued>('/api/kernel', { type: 'create_agent_credential', kind: 'construct', name: String(values.get('name')), expiresInDays: Number(values.get('days')) })
          setSecret(result); form.reset(); setRevision(value => value + 1)
        })
      }}>
        <FieldGroup>
          <Field name="name" isRequired isDisabled={busy} maxLength={80}><FieldLabel>Agent name</FieldLabel><Input placeholder="Cursor" /><FieldError /></Field>
          <Field name="days" type="number" isRequired isDisabled={busy} defaultValue="30"><FieldLabel>Expires in days (1–90)</FieldLabel><Input min={1} max={90} step={1} /><FieldError /></Field>
          <Button type="submit" disabled={busy}>{busy ? <Spinner data-icon="inline-start" /> : null}Create builder credential</Button>
        </FieldGroup>
      </Form>}
    </Dialog>
    <div className="main-body workspace-home-body" aria-busy={busy}>
      {owner ? <>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        {notice ? <Alert>{notice}</Alert> : null}
        <section className="stack" aria-label="Agent connections"><h2>Connected agents</h2><p className="muted workspace-section-lede">Builder credentials create applications in this workspace. Application credentials can read one application and propose only its permitted actions. Pending proposals appear in Inbox. Status reflects the last refresh.</p>
          {!busy && !error && !connections.length ? <p>No external agents are connected yet. Connect a builder to create applications from your MCP client, or grant an application credential below.</p> : null}
          {connections.map(item => <WorkspaceEntityCard
            key={item.id}
            title={item.name}
            description={item.kind === 'construct' ? 'Creates applications over MCP' : `${item.projectName} · ${item.actionCount} permitted ${item.actionCount === 1 ? 'action' : 'actions'}`}
            badge={<Badge variant={statusVariant(item.state)}>{item.state}</Badge>}
            actions={<>
              {item.projectSlug ? <WorkspaceActionLink to="/p/$projectSlug/build" params={{ projectSlug: item.projectSlug }}>Manage in application</WorkspaceActionLink> : null}
              {item.state !== 'Revoked' ? <Button variant="danger" disabled={busy} onPress={() => setRevokeTarget(item)}>Revoke {item.name}</Button> : null}
            </>}
          >
            <p className="muted">Expires {date(item.expiresAt)}</p>
          </WorkspaceEntityCard>)}
        </section>
        <section className="stack" aria-label="Application agent access"><h2>Application access</h2><p className="muted workspace-section-lede">Operate credentials belong to one published application. Open Agents in its configuration to choose actions.</p>
          {snapshot.projects.map(project => <WorkspaceEntityCard key={project.slug} title={project.name} actions={<WorkspaceActionLink to="/p/$projectSlug/build" params={{ projectSlug: project.slug }}>Configure access</WorkspaceActionLink>} />)}
          {!snapshot.projects.length ? <p>Publish an application before granting record access. Builder credentials do not need a published application.</p> : null}
        </section>
      </> : <Alert>Only a workspace owner can manage agent access.</Alert>}
    </div>
    <Dialog open={Boolean(revokeTarget)} onOpenChange={open => { if (!open) setRevokeTarget(undefined) }} title={revokeTarget ? `Revoke ${revokeTarget.name}?` : 'Revoke access'} description="This credential can no longer be used. Pending proposals from it cannot be applied. You can still reject them.">
      <div className="dialog-actions">
        <Button variant="outline" onPress={() => setRevokeTarget(undefined)}>Keep access</Button>
        <Button variant="destructive" disabled={busy} onPress={() => {
          const item = revokeTarget
          if (!item) return
          void run(async () => {
            await request('/api/kernel', { type: 'revoke_agent_credential', id: item.id })
            if (secret?.credential.id === item.id) setSecret(undefined)
            setRevokeTarget(undefined)
            setRevision(value => value + 1)
            setNotice(`${item.name} access revoked.`)
          })
        }}>Revoke {revokeTarget?.name}</Button>
      </div>
    </Dialog>
  </main>
}
