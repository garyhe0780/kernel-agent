import { useEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Field, FieldError, FieldGroup, FieldLabel, Form } from './ui/form-field'
import { Input } from './ui/input'
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Spinner } from './ui/surfaces'
import { date, request, type CapabilitySnapshot } from '@/lib/client'

type Scope = { capability: string; action: string; version: number }
type Credential = { id: string; name: string; prefix: string; expiresAt: string; revokedAt: string | null; actions: Scope[] }

export function AgentAccessPanel({ project, capabilities }: { project: string; capabilities: CapabilitySnapshot[] }) {
  const [credentials, setCredentials] = useState<Credential[]>()
  const [selected, setSelected] = useState<Scope[]>([])
  const [secret, setSecret] = useState<{ token: string; credential: Credential }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const secretField = useRef<HTMLInputElement>(null)
  useEffect(() => { if (secret) secretField.current?.focus() }, [secret])
  const refresh = async () => setCredentials(await request<Credential[]>(`/api/kernel?agents=${encodeURIComponent(project)}`))
  useEffect(() => { let alive = true; request<Credential[]>(`/api/kernel?agents=${encodeURIComponent(project)}`).then(value => { if (alive) setCredentials(value) }).catch(e => { if (alive) setError(e.message) }); return () => { alive = false } }, [project])
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await work() } catch (e) { setError(e instanceof Error ? e.message : 'The request failed. Try again.') } finally { setBusy(false) }
  }
  return <div className="stack">
    {error ? <Alert variant="danger">{error}</Alert> : null}
    {notice ? <Alert>{notice}</Alert> : null}
    <Card><CardHeader><CardTitle>Connect an agent</CardTitle><CardDescription>Give an external agent access to this application’s records and selected actions. It can propose changes as an operator; an owner must review every proposal.</CardDescription></CardHeader>
      <CardContent>
        <Form onSubmit={event => {
          event.preventDefault()
          const form = event.currentTarget
          const values = new FormData(form)
          void run(async () => {
            if (!selected.length) throw new Error('Select at least one action the agent may propose.')
            const result = await request<{ token: string; credential: Credential }>('/api/kernel', { type: 'create_agent_credential', project, name: String(values.get('name')), expiresInDays: Number(values.get('days')), actions: selected })
            setSecret(result); setSelected([]); form.reset(); await refresh()
          })
        }}>
          <FieldGroup>
            <Field name="name" isRequired isDisabled={busy} maxLength={80}><FieldLabel>Agent name</FieldLabel><Input placeholder="Purchasing assistant" /><FieldError /></Field>
            <Field name="days" type="number" isRequired isDisabled={busy} defaultValue="30"><FieldLabel>Expires in days (1–90)</FieldLabel><Input min={1} max={90} step={1} /><FieldError /></Field>
            <fieldset className="agent-actions" disabled={busy}><legend>Actions this agent may propose</legend>
              {capabilities.map(cap => <div key={cap.slug}><h3>{cap.definition.name}</h3>{cap.definition.actions.filter(action => action.roles.includes('operator')).map(action => {
                const checked = selected.some(s => s.capability === cap.slug && s.action === action.name)
                return <label className="agent-action" key={action.name}><input type="checkbox" checked={checked} onChange={event => setSelected(current => event.target.checked ? [...current, { capability: cap.slug, action: action.name, version: cap.version }] : current.filter(s => !(s.capability === cap.slug && s.action === action.name)))} /><span><strong>{action.label}</strong><span className="muted">{action.description}</span></span></label>
              })}</div>)}
            </fieldset>
            <p className="muted">This credential can read all records in this application. Selected actions are tied to their current definition version. A changed definition requires a new credential.</p>
            <Button type="submit" disabled={busy || Boolean(secret)}>{busy ? <Spinner data-icon="inline-start" /> : null}Create agent credential</Button>
          </FieldGroup>
        </Form>
      </CardContent>
    </Card>
    {secret ? <Card><CardHeader><CardTitle>Save {secret.credential.name}’s credential</CardTitle><CardDescription>The secret is shown once. Store it in your agent’s secret configuration before leaving this tab.</CardDescription></CardHeader><CardContent><Field isReadOnly value={secret.token}><FieldLabel>Agent credential</FieldLabel><Input ref={secretField} autoComplete="off" /></Field><div className="builder-actions"><Button variant="outline" onPress={() => void run(async () => { await navigator.clipboard.writeText(secret.token); setNotice('Credential copied.') })}>Copy credential</Button><Button variant="outline" disabled={busy} onPress={() => void run(async () => {
        const response = await fetch('/api/agent', { headers: { Authorization: `Bearer ${secret.token}` }, credentials: 'omit' })
        const value = await response.json()
        if (!response.ok) throw new Error(value.error || 'Read access failed.')
        setNotice(`Read access verified for ${value.project?.name ?? 'this application'}. ${value.capabilities.flatMap((cap: { tools: unknown[] }) => cap.tools).length} action tools available. No proposal was created.`)
      })}>Test read access</Button><Button variant="secondary" onPress={() => setSecret(undefined)}>I saved the credential</Button></div></CardContent></Card> : null}
    <Card><CardHeader><CardTitle>Agent credentials</CardTitle><CardDescription>Revoking a credential also prevents its pending proposals from being applied. You can still reject them.</CardDescription></CardHeader><CardContent>
      <Button variant="outline" disabled={busy} onPress={() => void run(refresh)}>Refresh credentials</Button>
      {!credentials ? <p className="muted">Loading credentials…</p> : credentials.length === 0 ? <Empty title="No agents connected" /> : credentials.map(credential => {
        const state = credential.revokedAt ? 'Revoked' : new Date(credential.expiresAt).getTime() <= Date.now() ? 'Expired' : credential.actions.some(scope => !capabilities.some(cap => cap.slug === scope.capability && cap.version === scope.version)) ? 'Definition changed' : 'Active'
        return <div className="migration-change" key={credential.id}><div className="builder-actions"><strong>{credential.name}</strong><Badge variant={state === 'Active' ? 'success' : 'warning'}>{state}</Badge></div><p className="muted">{credential.prefix}… · Expires {date(credential.expiresAt)}</p><ul>{credential.actions.map(scope => <li key={`${scope.capability}.${scope.action}`}>{capabilities.find(c => c.slug === scope.capability)?.definition.name ?? scope.capability} · {scope.action} · version {scope.version}</li>)}</ul>{!credential.revokedAt ? <Button variant="outline" disabled={busy} onPress={() => void run(async () => { await request('/api/kernel', { type: 'revoke_agent_credential', id: credential.id }); if (secret?.credential.id === credential.id) setSecret(undefined); await refresh(); setNotice(`${credential.name} access revoked.`) })}>Revoke {credential.name}</Button> : null}</div>
      })}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Connect your agent client</CardTitle><CardDescription>Send the secret in the Authorization: Bearer header to /api/agent on this server. GET returns this application’s records, allowed action contracts, and a nextCursor for pagination. POST stages a selected action.</CardDescription></CardHeader><CardContent><details open><summary>MCP connection</summary><p>Use Streamable HTTP at <code>/api/mcp</code> on this workspace’s server. Set <code>Authorization: Bearer &lt;agent credential&gt;</code> in your client’s secure header configuration.</p><p>Discover tools, call <code>list_records</code> to verify read access, then choose a permitted action. Its proposal appears in the application queue for review. Clients must support bearer headers; OAuth sign-in is not available.</p></details><details><summary>Direct HTTP API</summary><pre className="agent-example">{`POST /api/agent\nAuthorization: Bearer <agent credential>\nContent-Type: application/json\n\n{\n  "type": "stage",\n  "recordId": "<record ID from GET>",\n  "action": "<allowed action name>",\n  "input": {},\n  "idempotencyKey": "<unique request key>"\n}`}</pre><p className="muted">Reuse the same key and body when retrying. GET /api/agent?change=&lt;proposal ID&gt; returns the status of a proposal made with that credential.</p></details></CardContent></Card>
  </div>
}
