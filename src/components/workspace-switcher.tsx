import { useState } from 'react'
import { Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from './ui/button'
import { request } from '@/lib/client'

type Membership = { role: string; workspace: { id: string; name: string } }
export function WorkspaceSwitcher({ workspace }: { workspace: { id: string; name: string } }) {
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [created, setCreated] = useState<{ id: string; name: string }>()
  async function load() {
    setBusy(true); setError('')
    try { setMemberships(await request<Membership[]>('/api/kernel?workspaces=1')) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load workspaces.') } finally { setBusy(false) }
  }
  async function create() {
    if (busy || !name.trim()) return
    setBusy(true); setError('')
    try {
      const next = await request<{ id: string; name: string }>('/api/kernel', { type: 'create_workspace', name })
      setCreated(next); setName(''); setMemberships(current => [...current, { role: 'owner', workspace: next }])
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create workspace.') } finally { setBusy(false) }
  }
  return <DialogTrigger onOpenChange={open => { if (open) void load() }}><Button variant="ghost" className="workspace-switcher" aria-label={`Switch workspace, current workspace: ${workspace.name}`}><span>{workspace.name}</span><ChevronsUpDown /></Button><Popover className="app-switcher-popover workspace-switcher-popover" placement="bottom start" offset={8}><Dialog className="app-switcher-dialog" aria-label="Switch workspace"><h2>Your workspaces</h2><p className="muted">Switching changes this tab only.</p>{error ? <p role="alert">{error}</p> : null}{busy ? <p role="status">Loading…</p> : null}<nav className="app-switcher-list" aria-label="Workspaces">{memberships.map(item => <a key={item.workspace.id} href={`/workspace?workspace=${encodeURIComponent(item.workspace.id)}`} aria-current={item.workspace.id === workspace.id ? 'true' : undefined}><span>{item.workspace.name}<small>{item.role}</small></span>{item.workspace.id === workspace.id ? <Check size={16} aria-hidden="true" /> : null}</a>)}</nav>{error ? <Button variant="outline" disabled={busy} onPress={load}>Retry</Button> : null}{created ? <p role="status">{created.name} is ready. Select it above to open it.</p> : null}<form className="workspace-create" onSubmit={event => { event.preventDefault(); void create() }}><label>Create a workspace<input className="input" value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="Workspace name" disabled={busy} /></label><p className="muted">Starts empty, with you as owner. Applications and members stay separate.</p><Button type="submit" disabled={busy || !name.trim()}>Create workspace</Button></form></Dialog></Popover></DialogTrigger>
}
