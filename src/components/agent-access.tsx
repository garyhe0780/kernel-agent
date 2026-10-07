import { toast } from 'sonner'
import { CREATE_ACTION } from '@/kernel/record-operations'
import { useEffect, useRef, useState } from 'react'
import { Cable, Copy, Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, Form } from './ui/form-field'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { Alert, Badge, Spinner } from './ui/surfaces'
import { date, request, type CapabilitySnapshot } from '@/lib/client'

type Scope = { capability: string; action: string; version: number; execution?: 'review' | 'automatic' }
type Credential = { id: string; name: string; prefix: string; expiresAt: string; revokedAt: string | null; actions: Scope[] }
type Secret = { token: string; credential: Credential }

export function AgentAccessPanel({ project, capabilities, allowCreation = false }: { project: string; capabilities: CapabilitySnapshot[]; allowCreation?: boolean }) {
  const [credentials, setCredentials] = useState<Credential[]>()
  const [selected, setSelected] = useState<Scope[]>([])
  const [secret, setSecret] = useState<Secret>()
  const [step, setStep] = useState<'details' | 'permissions' | 'connect'>('details')
  const [open, setOpen] = useState(false)
  const [guide, setGuide] = useState(false)
  const [revoking, setRevoking] = useState<Credential>()
  const [name, setName] = useState('')
  const [days, setDays] = useState('30')
  const [entity, setEntity] = useState(capabilities[0]?.slug ?? '')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pageError, setPageError] = useState('')
  const [verified, setVerified] = useState(false)
  const [connectionNotice, setConnectionNotice] = useState('')
  const [origin, setOrigin] = useState('')
  const secretField = useRef<HTMLInputElement>(null)
  const permissionHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { setOrigin(window.location.origin) }, [])
  useEffect(() => {
    const target = step === 'connect' ? secretField.current : step === 'permissions' ? permissionHeading.current : null
    target?.focus({ preventScroll: true })
    target?.closest('.dialog-modal')?.scrollTo({ top: 0 })
  }, [step])
  const refresh = async () => { const value = await request<Credential[]>(`/api/kernel?agents=${encodeURIComponent(project)}`); setCredentials(value); setPageError('') }
  useEffect(() => {
    let alive = true
    request<Credential[]>(`/api/kernel?agents=${encodeURIComponent(project)}`).then(value => { if (alive) setCredentials(value) }).catch(e => { if (alive) setPageError(e.message) })
    return () => { alive = false }
  }, [project])
  async function run(work: () => Promise<void>) {
    setBusy(true); setError('')
    try { await work() } catch (e) { setError(e instanceof Error ? e.message : 'The request failed. Try again.') } finally { setBusy(false) }
  }
  const actionsFor = (cap: CapabilitySnapshot) => [
    ...(allowCreation ? [{ name: CREATE_ACTION, label: `Create ${cap.definition.entity.label.toLowerCase()}`, description: 'Propose a new record.', preconditions: [] }] : []),
    ...cap.definition.actions.filter(action => action.roles.includes('operator')),
  ]
  const activeCap = capabilities.find(cap => cap.slug === entity) ?? capabilities[0]
  const automatic = selected.filter(scope => scope.execution === 'automatic').length
  function start() { setName(''); setDays('30'); setSelected([]); setQuery(''); setEntity(capabilities[0]?.slug ?? ''); setError(''); setConnectionNotice(''); setVerified(false); setStep('details'); setOpen(true) }
  function close(value: boolean) { if (!value && !busy && !secret) { setOpen(false); setError('') } }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setConnectionNotice(`${label} copied.`) } catch { setError(`Could not copy ${label.toLowerCase()}. Select the field and copy it manually.`) }
  }
  async function create() {
    if (!selected.length) { setError('Select at least one action to continue.'); return }
    await run(async () => {
      const result = await request<Secret>('/api/kernel', { type: 'create_agent_credential', project, name: name.trim(), expiresInDays: Number(days), actions: selected })
      setSecret(result); setStep('connect')
      setCredentials(current => [result.credential, ...(current ?? [])])
      // Never hide a newly issued secret if refreshing the directory fails.
    })
  }
  function status(credential: Credential) {
    return credential.revokedAt ? 'Revoked' : new Date(credential.expiresAt).getTime() <= Date.now() ? 'Expired' : credential.actions.some(scope => !capabilities.some(cap => cap.slug === scope.capability && cap.version === scope.version)) ? 'Definition changed' : 'Active'
  }
  function actionLabel(scope: Scope) {
    const cap = capabilities.find(item => item.slug === scope.capability)
    return { entity: cap?.definition.name ?? scope.capability, action: scope.action === CREATE_ACTION ? `Create ${cap?.definition.entity.label.toLowerCase() ?? 'record'}` : (() => { const action = cap?.definition.actions.find(action => action.name === scope.action); return action ? `${action.label}${action.preconditions.length ? ` (${action.preconditions.map(rule => rule.label).join(' · ')})` : ''}` : scope.action })() }
  }
  const mcpUrl = `${origin}/api/mcp`
  return <section className="agent-access" aria-label="Agent access">
    <header className="agent-access-heading"><div><h2>Agent access</h2><p>Let external agents read this application and use the actions you allow.</p></div><div className="agent-access-tools"><Button variant="outline" onPress={() => { setError(''); setConnectionNotice(''); setGuide(true) }}>Connection guide</Button><Button onPress={start}><Plus data-icon="inline-start" />Connect an agent</Button></div></header>
    {pageError ? <Alert variant="danger">{pageError} <Button variant="outline" onPress={() => void refresh().catch(e => setPageError(e.message))}>Retry loading</Button></Alert> : null}
    <div className="agent-directory">
      <div className="agent-directory-heading"><h3>Credentials {credentials ? <span>{credentials.length}</span> : null}</h3><Button variant="ghost" size="icon" aria-label="Refresh credentials" disabled={busy} onPress={() => void refresh().catch(e => setPageError(e.message))}><RefreshCw /></Button></div>
      {!credentials ? <p className="agent-loading"><Spinner /> Loading credentials…</p> : !credentials.length ? <div className="agent-access-empty"><Cable aria-hidden="true" /><div><h3>Give your first agent access</h3><p>Choose its permissions, save a credential, then add it to your agent client.</p><Button onPress={start}>Connect an agent</Button></div></div> : <div className="agent-directory-list">{credentials.map(credential => {
        const state = status(credential)
        return <details className="agent-directory-item" key={credential.id}><summary><div className="agent-identity"><strong>{credential.name}</strong><span>{credential.prefix}…</span></div><Badge variant={state === 'Active' ? 'success' : state === 'Revoked' ? 'neutral' : 'warning'}>{state}</Badge><span className="agent-scope-count">{credential.actions.length} {credential.actions.length === 1 ? "action" : "actions"}</span><span className="agent-expiry">Expires {date(credential.expiresAt)}</span></summary><div className="agent-directory-detail"><p>While active, this credential reads all application records. {state === 'Definition changed' ? 'Create a new credential for the current action definitions.' : 'Action permissions are tied to the definition versions listed below.'}</p><ul>{credential.actions.map(scope => { const label = actionLabel(scope); return <li key={`${scope.capability}.${scope.action}`}><span>{label.entity} · <strong>{label.action}</strong><small>Definition v{scope.version}</small></span><Badge variant={scope.execution === 'automatic' ? 'warning' : 'neutral'}>{scope.execution === 'automatic' ? 'Automatic' : 'Human review'}</Badge></li> })}</ul>{!credential.revokedAt ? <Button variant="outline" onPress={() => { setError(''); setRevoking(credential) }}>Revoke access</Button> : null}</div></details>
      })}</div>}
    </div>
    <p className="agent-access-footnote"><ShieldCheck aria-hidden="true" />A credential grants access; it does not confirm that an agent client is connected. Proposals requiring review appear in the application’s review queue.</p>
    <Dialog open={open} onOpenChange={close} title={step === 'connect' ? `Connect ${secret?.credential.name ?? 'your agent'}` : 'Connect an agent'} description={step === 'details' ? 'Name this agent and choose how long its access lasts.' : step === 'permissions' ? 'Choose what the agent can do. Every action requires human review by default.' : 'Save the credential, then configure your agent client.'} className={step === 'permissions' ? 'agent-setup-modal agent-permissions-modal' : 'agent-setup-modal'} isDismissable={!busy && !secret} showCloseButton={!busy && !secret}>
      <ol className="agent-setup-progress" aria-label="Connection steps">{['Details', 'Permissions', 'Connect client'].map((label, index) => <li key={label} aria-current={index === ['details', 'permissions', 'connect'].indexOf(step) ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {step === 'details' ? <Form onSubmit={event => { event.preventDefault(); setError(''); setStep('permissions') }}><FieldGroup><Field name="name" isRequired maxLength={80} value={name} onChange={setName} validate={value => value.trim() ? null : 'Enter an agent name.'}><FieldLabel>Agent name</FieldLabel><Input autoFocus placeholder="e.g. Sales assistant" /><FieldError /></Field><Field name="days" type="number" isRequired value={days} onChange={setDays}><FieldLabel>Access expires in</FieldLabel><div className="agent-expiry-input"><Input min={1} max={90} step={1} /><span>days</span></div><FieldError /><p className="field-description">Choose 1–90 days. You can revoke access at any time.</p></Field><p className="agent-setup-note">This credential is for working with this application’s records. To build applications, create a builder credential from workspace Agents.</p></FieldGroup><footer className="agent-dialog-footer"><Button variant="outline" onPress={() => close(false)}>Cancel</Button><Button type="submit">Choose permissions</Button></footer></Form> : null}
      {step === 'permissions' ? <div className="agent-permissions"><h3 ref={permissionHeading} tabIndex={-1} className="agent-permission-heading">Action permissions</h3><p className="agent-read-scope"><ShieldCheck aria-hidden="true" /><span><strong>Read access included</strong>All records in this application are readable. Select at least one action below.</span></p><div className="agent-permission-filters"><Select label="Entity" value={activeCap?.slug ?? ''} onChange={value => { setEntity(value); setQuery('') }} options={capabilities.map(cap => ({ value: cap.slug, label: `${cap.definition.name} (${selected.filter(scope => scope.capability === cap.slug).length} selected)` }))} /><Field value={query} onChange={setQuery}><FieldLabel>Find an action</FieldLabel><Input placeholder="Search this entity" /></Field></div><fieldset disabled={busy} className="agent-permission-list"><legend className="sr-only">Allowed actions for {activeCap?.definition.name}</legend>{activeCap ? actionsFor(activeCap).filter(action => `${action.label} ${action.description}`.toLowerCase().includes(query.toLowerCase())).map(action => {
        const scope = selected.find(item => item.capability === activeCap.slug && item.action === action.name)
        return <div key={action.name} className={`agent-permission-row${scope ? ' is-selected' : ''}`}><label><input type="checkbox" checked={Boolean(scope)} onChange={event => setSelected(current => event.target.checked ? [...current, { capability: activeCap.slug, action: action.name, version: activeCap.version, execution: 'review' }] : current.filter(item => !(item.capability === activeCap.slug && item.action === action.name)))} /><span><strong>{action.label}</strong><span>{action.description}</span>{action.preconditions.length ? <small>{action.preconditions.map(rule => rule.label).join(" · ")}</small> : null}</span></label>{scope && allowCreation ? <label className="agent-execution-mode"><span>Execution</span><select aria-label={`Execution for ${action.label}${action.preconditions.length ? ` (${action.preconditions.map(rule => rule.label).join(" · ")})` : ""}`} value={scope.execution ?? 'review'} onChange={event => setSelected(current => current.map(item => item === scope ? { ...item, execution: event.target.value as 'review' | 'automatic' } : item))}><option value="review">Human review</option><option value="automatic">Automatic</option></select></label> : scope ? <span className="agent-review-label">Human review</span> : null}</div>
      }) : null}{activeCap && !actionsFor(activeCap).filter(action => `${action.label} ${action.description}`.toLowerCase().includes(query.toLowerCase())).length ? <p className="agent-no-actions">No actions match. Try another search or entity.</p> : null}</fieldset>{automatic ? <Alert variant="warning">{automatic} {automatic === 1 ? 'action can' : 'actions can'} run immediately without approval. Validation and business policies still apply.</Alert> : null}<p className="agent-setup-note">Permissions use the current action definitions. If those definitions change, create a new credential.</p><footer className="agent-dialog-footer agent-permission-footer"><div className={`agent-commit-summary${automatic ? " is-automatic" : ""}`} role="status"><strong>{selected.length} {selected.length === 1 ? "action" : "actions"} selected</strong><span>{automatic ? `${automatic} can run without human approval` : "Human review required"}</span></div>{selected.length ? <details className="agent-selected-actions"><summary>Review selected actions</summary><ul tabIndex={0} aria-label="Selected action permissions">{selected.map(scope => { const label = actionLabel(scope); return <li key={`${scope.capability}.${scope.action}`}><span>{label.entity} · {label.action}</span><strong>{scope.execution === "automatic" ? "Automatic" : "Human review"}</strong></li> })}</ul></details> : null}<Button variant="outline" disabled={busy} onPress={() => { setError(''); setStep('details') }}>Back</Button><Button disabled={busy || !selected.length} onPress={() => void create()}>{busy ? <Spinner data-icon="inline-start" /> : null}{automatic ? 'Create with automatic access' : 'Create credential'}</Button></footer></div> : null}
      {step === 'connect' && secret ? <div className="agent-client-setup"><div className="agent-secret"><Field isReadOnly value={secret.token}><FieldLabel>Agent credential · shown once</FieldLabel><Input ref={secretField} autoComplete="off" onFocus={event => event.target.select()} /></Field><p>Save this in your client’s secure configuration. It cannot be retrieved again.</p><Button variant="outline" onPress={() => void copy(secret.token, 'Credential')}><Copy data-icon="inline-start" />Copy credential</Button></div><ConnectionFields url={mcpUrl} onCopy={() => void copy(mcpUrl, 'Server URL')} /><details className="agent-http-guide"><summary>Using the HTTP API instead?</summary><HttpGuide /></details>{connectionNotice ? <p role="status" className="agent-connection-notice">{connectionNotice}</p> : null}{verified ? <Alert>Read access verified. Your agent client can now use this credential; its connection must be configured separately.</Alert> : null}<footer className="agent-dialog-footer"><Button variant="outline" disabled={busy} onPress={() => void run(async () => {
        const response = await fetch('/api/agent', { headers: { Authorization: `Bearer ${secret.token}` }, credentials: 'omit', signal: AbortSignal.timeout(15000) })
        const value = await response.json()
        if (!response.ok) throw new Error(value.error || 'Read access failed. Check the credential and try again.')
        setVerified(true)
      })}>{busy ? <Spinner data-icon="inline-start" /> : null}Test read access</Button><Button disabled={busy} onPress={() => { setSecret(undefined); setOpen(false); toast.success(`${secret.credential.name}’s credential created.`, { description: "Keep it in your client’s secure configuration." }) }}>I saved the credential</Button></footer></div> : null}
    </Dialog>
    <Dialog open={guide} onOpenChange={setGuide} title="Connection guide" description="Use an active agent credential in your client’s secure configuration." className="agent-setup-modal"><ConnectionFields url={mcpUrl} onCopy={() => void copy(mcpUrl, 'Server URL')} /><p className="agent-setup-note">Credentials are shown once when created. If you no longer have yours, revoke it and connect the agent again.</p><details className="agent-http-guide"><summary>Direct HTTP API</summary><HttpGuide /></details>{connectionNotice ? <p role="status" className="agent-connection-notice">{connectionNotice}</p> : null}{error ? <Alert variant="danger">{error}</Alert> : null}<footer className="agent-dialog-footer"><Button onPress={() => setGuide(false)}>Done</Button></footer></Dialog>
    <Dialog open={Boolean(revoking)} onOpenChange={value => { if (!value && !busy) setRevoking(undefined) }} title={`Revoke ${revoking?.name ?? 'agent'}’s access?`} description="The credential will stop working immediately. Its pending proposals cannot be applied, but you can still reject them." isDismissable={!busy} showCloseButton={!busy}>{error ? <Alert variant="danger">{error}</Alert> : null}<footer className="agent-dialog-footer"><Button variant="outline" disabled={busy} onPress={() => setRevoking(undefined)}>Cancel</Button><Button variant="danger" disabled={busy} onPress={() => void run(async () => {
      const credential = revoking!
      await request('/api/kernel', { type: 'revoke_agent_credential', id: credential.id })
      setCredentials(current => current?.map(item => item.id === credential.id ? { ...item, revokedAt: new Date().toISOString() } : item)); setRevoking(undefined); toast.success(`${credential.name} access revoked.`)
    })}>{busy ? <Spinner data-icon="inline-start" /> : null}Revoke access</Button></footer></Dialog>
  </section>
}

function ConnectionFields({ url, onCopy }: { url: string; onCopy: () => void }) {
  return <div className="agent-connection-fields"><h3>MCP client setup</h3><Field isReadOnly value={url}><FieldLabel>Server URL</FieldLabel><div className="agent-copy-field"><Input onFocus={event => event.target.select()} /><Button variant="outline" size="icon" aria-label="Copy server URL" onPress={onCopy}><Copy /></Button></div></Field><dl><div><dt>Transport</dt><dd>Streamable HTTP</dd></div><div><dt>Authorization header</dt><dd><code>Bearer &lt;agent credential&gt;</code></dd></div></dl><p>Set <code>Authorization</code> to <code>Bearer</code> followed by your credential in the client’s secure headers. Your client must support bearer headers; OAuth sign-in is unavailable.</p><p>Discover tools, then call <code>list_records</code> to verify access. Actions requiring review appear in the application’s review queue.</p></div>
}
function HttpGuide() {
  return <div><p><code>GET /api/agent</code> returns records, permitted action contracts, and a <code>nextCursor</code> for pagination. To propose an action:</p><pre className="agent-example">{`POST /api/agent\nAuthorization: Bearer <agent credential>\nContent-Type: application/json\n\n{\n  "type": "stage",\n  "recordId": "<record ID from GET>",\n  "action": "<allowed action name>",\n  "input": {},\n  "idempotencyKey": "<unique request key>"\n}`}</pre><p>Automatic permissions allow immediate execution. Reuse the same request key and body when retrying. <code>GET /api/agent?change=&lt;proposal ID&gt;</code> returns a proposal’s status.</p></div>
}
