import { pendingInvitation, rememberInvitation, clearInvitation } from '@/lib/pending-invitation'
import { useEffect, useState } from 'react'
import { Link, useBlocker } from '@tanstack/react-router'
import { Building2, Users, Cpu, ShieldCheck, ArrowUpRight, ArrowLeft, Search } from 'lucide-react'
import { LoadingShell, ProjectFrame } from './project-frame'
import { Alert, Badge } from './ui/surfaces'
import { Button } from './ui/button'
import { Field, FieldLabel } from './ui/form-field'
import { Input } from './ui/input'
import { Dialog } from './ui/dialog'
import { authClient } from '@/lib/auth-client'
import { date, request, type Snapshot } from '@/lib/client'

type Member = { role: string; user: { id: string; name: string; email: string } }
type Settings = { workspace: { id: string; name: string; createdAt: string }; members: Member[]; invitations: { id: string; email: string; role: string; expiresAt: string }[]; model: { configured: boolean; model: string | null; hostname: string | null; timeoutSeconds: number | null; protocol: string; configurationError: string | null } }
type Connection = { id: string; name: string; kind?: 'operate' | 'construct'; projectSlug: string | null; projectName: string; expiresAt: string; actionCount: number; state: string }
const sections = [{ id: 'general', name: 'General', icon: Building2 }, { id: 'members', name: 'Members & access', icon: Users }, { id: 'models', name: 'Models & providers', icon: Cpu }, { id: 'agents', name: 'Agents & permissions', icon: ShieldCheck }] as const
type Section = typeof sections[number]['id']
export function WorkspaceSettings() {
  const session = authClient.useSession()
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [settings, setSettings] = useState<Settings>()
  const [connections, setConnections] = useState<Connection[]>([])
  const [section, setSection] = useState<Section>('general')
  const [settingsSearch, setSettingsSearch] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('operator')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [invitation, setInvitation] = useState<{workspaceName:string;role:string;email:string}>()
  const [joined, setJoined] = useState<{workspaceId: string; name: string}>()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')
  const [confirmation, setConfirmation] = useState<{ title: string; description: string; command: object }>()
  const dirty = Boolean(settings && name !== settings.workspace.name)
  const blocker = useBlocker({ shouldBlockFn: () => dirty, enableBeforeUnload: () => dirty, withResolver: true })
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const token = hash.get('invite') || pendingInvitation()
    if (token) { setInviteToken(token); rememberInvitation(token) }
    const current = hash.get('section')
    if (sections.some(item => item.id === current)) setSection(current as Section)
  }, [])
  useEffect(() => {
    if (!session.data) return
    let active = true
    setBusy(true); setError('')
    request<Snapshot>('/api/kernel').then(async next => {
      if (!active) return
      setSnapshot(next)
      if (next.principal.role === 'owner') {
        const [data, agents] = await Promise.all([request<Settings>('/api/kernel?settings=1'), request<Connection[]>('/api/kernel?workspaceAgents=1')])
        if (active) { setSettings(data); setName(data.workspace.name); setConnections(agents) }
      }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load settings.') }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [session.data?.user.id, revision])
  useEffect(() => {
    if (!inviteToken || !session.data) return
    let active = true
    request<{workspaceName:string;role:string;email:string}>('/api/kernel', {type:'preview_invitation',token:inviteToken}).then(value => { if (active) setInvitation(value) }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to read invitation.') })
    return () => { active = false }
  }, [inviteToken, session.data?.user.id])
  async function mutate(command: object, message: string) {
    setBusy(true); setError(''); setNotice('')
    try { await request('/api/kernel', command); setNotice(message); setRevision(value => value + 1) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save changes.'); setBusy(false) }
  }
  async function save() {
    if (!settings || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await request<{ name: string }>('/api/kernel', { type: 'rename_workspace', name, expectedName: settings.workspace.name })
      setSettings({ ...settings, workspace: { ...settings.workspace, name: result.name } }); setName(result.name)
      setSnapshot(current => current ? { ...current, workspace: { ...current.workspace, name: result.name } } : current)
      setNotice('Workspace name saved.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the workspace name.') } finally { setBusy(false) }
  }
  async function invite() {
    setBusy(true); setError(''); setInviteLink('')
    try {
      const result = await request<{token: string}>('/api/kernel', { type: 'invite_member', email: email.trim(), role: inviteRole })
      setInviteLink(`${window.location.origin}/settings?workspace=default#invite=${encodeURIComponent(result.token)}`)
      setEmail(''); setRevision(value => value + 1)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create invitation.'); setBusy(false) }
  }
  async function acceptInvite() {
    setBusy(true); setError('')
    try { setJoined(await request('/api/kernel', { type: 'accept_invitation', token: inviteToken })); clearInvitation(); window.history.replaceState(null, '', '/settings'); setInviteToken('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to accept invitation.') } finally { setBusy(false) }
  }
  if (session.isPending) return <LoadingShell />
  if (!session.data) return <main className="auth-page"><h1>Sign in to Kernel</h1><p>Sign in with the invited email address. Your invitation will be ready after signing in. New accounts also need the Kernel invitation code.</p><Link to="/login" search={{mode:'login'}}>Sign in or create an account</Link></main>
  if (inviteToken || joined) return <main className="auth-page"><h1>{joined ? `Welcome to ${joined.name}` : 'Join a workspace'}</h1><p>{joined ? 'Your workspace membership is ready.' : invitation ? `Join ${invitation.workspaceName} as ${invitation.role}, using ${invitation.email}.` : error ? 'Invitation unavailable. Ask a workspace owner for a new link, or sign in with the invited email.' : 'Checking your invitation…'}</p>{error ? <Alert variant="danger">{error}</Alert> : null}{joined ? <a href={`/?workspace=${encodeURIComponent(joined.workspaceId)}`}>Open workspace</a> : <Button disabled={busy || !invitation} onPress={acceptInvite}>Accept invitation</Button>}<a href="/" onClick={clearInvitation}>Back to workspace</a></main>
  if (!snapshot) return error ? <main className="auth-page"><a href="/?workspace=default">Return to default workspace</a><Alert variant="danger">{error}</Alert><Button onPress={() => setRevision(value => value + 1)}>Try again</Button></main> : <LoadingShell />
  const matchingSections = sections.filter(item => {
    const keywords = { general: 'workspace name identifier created', members: 'workspace invite people roles owner operator access', models: 'intelligence provider model connection timeout api', agents: 'intelligence agent permissions credentials revoke access' }
    return `${item.name} ${keywords[item.id]}`.toLowerCase().includes(settingsSearch.trim().toLowerCase())
  })
  const settingsNavigation = (closeNavigation: () => void) => <div className="settings-sidebar">
    <Link to="/" className="nav-item settings-back" onClick={closeNavigation}><ArrowLeft aria-hidden="true" /><span>Back to workspace</span></Link>
    <label className="settings-sidebar-search"><Search aria-hidden="true" /><input type="search" aria-label="Search settings" placeholder="Search settings…" value={settingsSearch} onChange={event => setSettingsSearch(event.target.value)} /></label>
    <nav aria-label="Settings sections">{[{ name: 'Workspace', ids: ['general', 'members'] }, { name: 'Intelligence', ids: ['models', 'agents'] }].map(group => {
      const items = matchingSections.filter(item => group.ids.includes(item.id))
      return items.length ? <section className="settings-sidebar-group" key={group.name} aria-label={group.name}><h2>{group.name}</h2>{items.map(item => <Button key={item.id} variant="ghost" className="nav-item" aria-current={section === item.id ? 'page' : undefined} onPress={() => { setSection(item.id); setNotice(''); window.history.replaceState(null, '', `#section=${item.id}`); closeNavigation() }}><item.icon aria-hidden="true" /><span>{item.name}</span></Button>)}</section> : null
    })}{!matchingSections.length ? <p className="settings-search-empty" role="status">No settings match “{settingsSearch}”.</p> : null}</nav>
  </div>
  return <ProjectFrame snapshot={snapshot} workspace settingsNavigation={settingsNavigation} headerLocation={`Settings / ${sections.find(item => item.id === section)!.name}`}><main className="main" id="main-content" tabIndex={-1}>
    <header className="main-header"><div><h1>Workspace settings</h1><p>Manage your workspace, people, and connected intelligence.</p></div><Button variant="outline" disabled={busy || dirty || testing} onPress={() => { setNotice(''); setRevision(value => value + 1) }}>Refresh</Button></header>
    <Dialog open={blocker.status === 'blocked'} onOpenChange={open => { if (!open) blocker.reset?.() }} title="Leave with unsaved changes?" description="Your workspace name has not been saved."><Button onPress={() => blocker.reset?.()}>Keep editing</Button><Button variant="outline" onPress={() => blocker.proceed?.()}>Discard and leave</Button></Dialog>
    <Dialog open={Boolean(confirmation)} onOpenChange={open => { if (!open) setConfirmation(undefined) }} title={confirmation?.title ?? 'Confirm change'} description={confirmation?.description ?? ''}><Button variant="outline" onPress={() => setConfirmation(undefined)}>Cancel</Button><Button onPress={() => { if (confirmation) { void mutate(confirmation.command, 'Access updated.'); setConfirmation(undefined) } }}>Confirm change</Button></Dialog>
    <div className="settings-layout">

      <div className="settings-content" aria-busy={busy}>
        {error ? <Alert variant="danger">{error}</Alert> : null}{notice ? <p className="settings-notice" role="status">{notice}</p> : null}
        {dirty && section !== 'general' ? <p role="status">You have an unsaved workspace name. <button className="text-button" onClick={() => setSection('general')}>Return to General</button></p> : null}
        {snapshot.principal.role !== 'owner' ? <Alert>Only an owner can manage workspace settings.</Alert> : settings ? <>
          {section === 'general' ? <section aria-labelledby="general-title"><div className="settings-section-heading"><h2 id="general-title">General</h2><p>The identity of your workspace.</p></div><div className="setting-row"><div><h3>Workspace name</h3><p>Shown in navigation and the workspace switcher.</p></div><div className="setting-control"><Field value={name} onChange={setName} isDisabled={busy} maxLength={80}><FieldLabel className="sr-only">Workspace name</FieldLabel><Input /></Field><div className="actions"><Button disabled={busy || !dirty || !name.trim()} onPress={save}>Save changes</Button>{dirty ? <Button variant="outline" disabled={busy} onPress={() => { setName(settings.workspace.name); setNotice('') }}>Discard</Button> : null}</div></div></div><div className="setting-row"><div><h3>Workspace ID</h3><p>A permanent identifier for this workspace.</p></div><span className="settings-value">{settings.workspace.id}</span></div><div className="setting-row"><div><h3>Created</h3><p>Applications and membership belong to this workspace.</p></div><span>{date(settings.workspace.createdAt)}</span></div></section> : null}
          {section === 'members' ? <section aria-labelledby="members-title"><div className="settings-section-heading"><h2 id="members-title">Members & access</h2><p>Workspace invitations can use every application. To invite someone to one application, open that application and choose Invite user.</p></div><form className="settings-invite" onSubmit={event => { event.preventDefault(); void invite() }}><h3>Invite a colleague</h3><p>Generate a private link to share. It expires in seven days and works only for the invited email. No email is sent.</p><div className="settings-invite-fields"><label>Email address<input className="input" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="colleague@company.com" disabled={busy} /></label><label>Workspace role<select className="input" value={inviteRole} onChange={event => setInviteRole(event.target.value)} disabled={busy}><option value="operator">Operator</option><option value="owner">Owner</option></select></label><Button type="submit" disabled={busy || dirty || !email.trim()}>Create invite link</Button></div>{inviteRole === 'owner' ? <p>Owners can manage members, configure applications, and grant agent access.</p> : <p>Operators work with records and actions permitted by each application.</p>}{inviteLink ? <div className="settings-invite-result" role="status"><label>Invitation link<input className="input" readOnly value={inviteLink} onFocus={event => event.target.select()} /></label><p>Copy this link now. Creating another invitation for the same email replaces it.</p></div> : null}</form><h3 className="settings-list-title">Members · {settings.members.length}</h3>{settings.members.map(member => <div className="settings-member" key={member.user.id}><span className="desk-avatar">{member.user.name.slice(0, 1)}</span><div className="settings-member-identity"><strong>{member.user.name}{member.user.id === snapshot.principal.userId ? ' (you)' : ''}</strong><p>{member.user.email}</p></div><Badge>{member.role === 'application' ? 'Application' : member.role}</Badge>{member.user.id !== snapshot.principal.userId ? <div className="actions">{member.role === 'application' ? null : <Button variant="outline" disabled={busy || dirty} onPress={() => setConfirmation({ title: `Change ${member.user.name}’s role?`, description: member.role === 'owner' ? 'This person will become an operator. Agent credentials they created will lose access while they are not an owner.' : 'This person will be able to manage members, applications, and agent credentials.', command: {type:'update_member', userId:member.user.id, expectedRole:member.role === 'owner' || member.role === 'operator' ? member.role : 'operator', role:member.role === 'owner' ? 'operator' : 'owner'} })}>{member.role === 'owner' ? 'Make operator' : 'Make owner'}</Button>}<Button variant="ghost" disabled={busy || dirty} onPress={() => setConfirmation({title:`Remove ${member.user.name}?`, description:'They will lose access to this workspace. Their records and activity history remain.', command:{type:'update_member',userId:member.user.id,expectedRole:member.role,role:'remove'}})}>Remove</Button></div> : null}</div>)}{settings.invitations.length ? <><h3 className="settings-list-title">Pending invitations</h3>{settings.invitations.map(item => <div className="settings-member" key={item.id}><div className="settings-member-identity"><strong>{item.email}</strong><p>{item.role} · Expires {date(item.expiresAt)}</p></div><Button variant="outline" disabled={busy || dirty} onPress={() => { setInviteLink(''); void mutate({type:'revoke_invitation',id:item.id}, 'Invitation revoked.') }}>Revoke</Button></div>)}</> : null}<p className="settings-footnote">Your own access is protected. Another owner must change your role or remove you.</p></section> : null}
          {section === 'models' ? <section aria-labelledby="models-title"><div className="settings-section-heading"><h2 id="models-title">Models & providers</h2><p>The intelligence used to plan, build, and operate applications.</p></div><div className="setting-row"><div><h3>Default connection</h3><p>Managed by your installation administrator. Shared across workspaces on this server.</p></div><Badge>{settings.model.configured ? 'Configured' : 'Not configured'}</Badge></div>{[['Provider host',settings.model.hostname ?? 'Not available'],['Default model',settings.model.model ?? 'Not selected'],['API compatibility',settings.model.protocol],['Build request timeout',`${settings.model.timeoutSeconds ?? '—'} seconds`]].map(([label,value]) => <div className="setting-row" key={label}><h3>{label}</h3><span className="settings-value">{value}</span></div>)}{settings.model.configurationError ? <Alert variant="danger">{settings.model.configurationError}</Alert> : null}<div className="setting-row"><div><h3>Connection test</h3><p>Sends a short test prompt without workspace data. Provider usage charges may apply. The test stops after 15 seconds.</p></div><Button variant="outline" disabled={testing || !settings.model.configured || Boolean(settings.model.configurationError)} onPress={async () => { setTesting(true); setTestResult(''); try { const result = await request<{latencyMs:number;testedAt:string}>('/api/kernel',{type:'test_model_connection'}); setTestResult(`Responded in ${(result.latencyMs / 1000).toFixed(1)} seconds · ${date(result.testedAt)}. This checks a short response, not a full application build.`) } catch(e) { setTestResult(e instanceof Error ? e.message : 'Connection test failed.') } finally { setTesting(false) } }}>{testing ? 'Testing connection…' : 'Test connection'}</Button></div><p role="status" className="settings-footnote">{testResult || 'Connection health has not been tested in this session.'}</p><details className="settings-help"><summary>How to change this connection</summary><p>Your server administrator sets KERNEL_API_BASE_URL, KERNEL_API_KEY, KERNEL_MODEL, and KERNEL_MODEL_TIMEOUT_MS in the environment, then restarts the server. The endpoint must support the Responses API. Native AWS Bedrock endpoints require a compatible gateway or a separate adapter.</p><p>API keys stay on the server and are never displayed here.</p></details></section> : null}
          {section === 'agents' ? <section aria-labelledby="agents-title"><div className="settings-section-heading"><h2 id="agents-title">Agents & permissions</h2><p>Builder credentials create applications over MCP. Application credentials read one application and propose selected actions.</p></div><div className="setting-row"><div><h3>Human review</h3><p>Operational agents propose record changes. Application policies and human review determine whether those changes are applied. Publishing an application from a builder credential does not apply records.</p></div><Badge>Required</Badge></div><h3 className="settings-list-title">Connections · {connections.length}</h3>{connections.length ? connections.map(item => <div className="settings-member" key={item.id}><div className="settings-member-identity"><strong>{item.name}</strong><p>{item.kind === 'construct' ? 'Creates applications over MCP' : `${item.projectName} · ${item.actionCount} permitted actions`}</p><p>Expires {date(item.expiresAt)}</p></div><Badge>{item.state}</Badge>{item.state !== 'Revoked' ? <Button variant="outline" disabled={busy || dirty} onPress={() => setConfirmation({title:`Revoke ${item.name}?`,description:'This credential will stop accepting new requests. Existing proposals remain available for review.',command:{type:'revoke_agent_credential',id:item.id}})}>Revoke</Button> : null}</div>) : <p className="settings-empty">No agent connections yet. Connect a builder from Agents, or choose an application to grant record access.</p>}<h3 className="settings-list-title">Application permissions</h3>{snapshot.projects.map(project => <Link className="settings-application-link" key={project.slug} to="/p/$projectSlug/build" params={{projectSlug:project.slug}}><span>{project.name}</span><span>Configure access <ArrowUpRight aria-hidden="true" /></span></Link>)}{!snapshot.projects.length ? <p>Publish an application before granting record access. Builder credentials do not need a published application.</p> : <p className="settings-footnote">Open Agents in application configuration to select permitted actions and issue an expiring operate credential. Issue builder credentials from Agents.</p>}</section> : null}
        </> : busy ? <p role="status">Loading settings…</p> : <Button onPress={() => setRevision(value => value + 1)}>Try again</Button>}
      </div>
    </div>
  </main></ProjectFrame>
}
