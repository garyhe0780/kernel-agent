import { ApplicationStudio } from './application-studio'
import type { BuilderPlan } from '@/kernel/builder-plan'
import type { Draft } from '@/kernel/application'
import { useRefreshWorkspace, useWorkspaceSnapshot } from './workspace-layout'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surfaces'
import { Dialog } from './ui/dialog'
import { projectKind } from '@/kernel/projects'
import { moduleById } from '@/kernel/modules'
import { request } from '@/lib/client'


export function WorkspaceHome({ view = 'overview', assemble }: { view?: 'overview' | 'applications'; assemble?: string }) {
  const snapshot = useWorkspaceSnapshot()
  const refresh = useRefreshWorkspace()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [workLoaded, setWorkLoaded] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [model, setModel] = useState({ configured: false, model: null as string | null })
  const [building, setBuilding] = useState(false)
  const [plans, setPlans] = useState<BuilderPlan[]>([])
  const [planId, setPlanId] = useState<string>()
  const [draft, setDraft] = useState<Draft>()
  const [seedModules, setSeedModules] = useState<string[]>()
  const [busy, setBusy] = useState('')
  const [removeOpen, setRemoveOpen] = useState(false)
  const owner = snapshot.principal.role === 'owner'
  const demo = snapshot.projects.find(project => project.demo)
  const applications = snapshot.projects.filter(project => !project.demo)

  useEffect(() => {
    if (!owner) return
    let cancelled = false
    request<{ drafts: Draft[]; model: typeof model }>('/api/kernel?drafts=1')
      .then(async data => {
        if (cancelled) return
        setDrafts(data.drafts); setModel(data.model); setPlans(await request<BuilderPlan[]>('/api/kernel?plans=1')); setWorkLoaded(true)
      })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load saved work.') })
    return () => { cancelled = true }
  }, [snapshot.principal.userId, snapshot.principal.role, owner])

  useEffect(() => {
    if (!assemble || !owner) return
    const modules = assemble.split(',').map(value => value.trim()).filter(id => moduleById(id))
    if (!modules.length) return
    setDraft(undefined)
    setPlanId(undefined)
    setSeedModules(modules)
    setBuilding(true)
    void navigate({ to: '/applications', search: {}, replace: true })
  }, [assemble, owner, navigate])

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label); setError('')
    try { await work() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update the purchasing demo.') }
    finally { setBusy('') }
  }

  const firstRun = !building && applications.length === 0
  const overviewIdle = view === 'overview' && workLoaded && owner && !plans.some(p => p.status !== 'generated') && !drafts.length

  return (
    <main className="main" id="main-content" tabIndex={-1}>
        <header className="main-header" hidden={building}>
          <div>
            <h1>{building ? 'Create application' : view === 'overview' ? 'Overview' : 'Applications'}</h1>
            <p>{building ? 'Describe, try, and refine your application before publishing.' : view === 'overview' ? 'Pick up your work or open an application.' : 'Build the tools your business needs. Let agents help run them.'}</p>
          </div>
          {owner && !building ? <Button onPress={() => { setDraft(undefined); setPlanId(undefined); setSeedModules(undefined); setBuilding(true) }}>Create application</Button> : null}
        </header>
        <div className="main-body workspace-home-body">
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {building ? <ApplicationStudio key={planId ?? draft?.id ?? seedModules?.join(',') ?? 'new'} planId={planId} draft={draft} seedModules={draft || planId ? undefined : seedModules} model={model} onSaved={next => setDrafts(current => [next, ...current.filter(d => d.id !== next.id)])} onClose={() => { setBuilding(false); setSeedModules(undefined); request<BuilderPlan[]>('/api/kernel?plans=1').then(setPlans).catch(e => setError(e.message)) }} /> : null}
          {!building && overviewIdle && !firstRun ? <section className="stack"><h2>Ready for your next idea</h2><p className="muted">No saved plans or drafts to continue. Create an application when you’re ready.</p></section> : null}
          {!building && plans.some(p => p.status !== 'generated') ? <section className="stack" aria-label="Saved plans"><h2>Continue planning</h2>{plans.filter(p => p.status !== 'generated').map(p => <div className="draft-row" key={p.id}><div><strong>{p.content.proposal?.plan.name || p.content.request.slice(0, 80)}</strong><p className="muted">Saved plan · {p.status === 'confirmed' ? 'Ready to build' : 'In progress'}</p></div><Button variant="outline" onPress={() => { setPlanId(p.id); setDraft(drafts.find(d => d.id === p.draftId)); setBuilding(true) }}>Open plan</Button></div>)}</section> : null}
          {!building && drafts.length ? <section className="stack" aria-label="Saved drafts"><h2>Continue building</h2>{drafts.map(item => <div className="draft-row" key={item.id}><div><strong>{item.definition.name}</strong><p className="muted">{item.baseProjectVersion ? `Application v${item.baseProjectVersion} changes` : 'Draft'} · revision {item.version} · {item.assembly ? `${item.assembly.modules.length} modules` : `${item.definition.entities.length} entities`}</p></div><Button variant="outline" onPress={() => { setDraft(item); setPlanId(undefined); setBuilding(true) }}>Open draft</Button></div>)}</section> : null}
          {firstRun ? (
            <Card>
              <CardHeader>
                <CardTitle>{demo ? 'Try the purchasing demo' : 'Your first business application starts here'}</CardTitle>
                <CardDescription>{demo
                  ? 'Sample requests are waiting for a decision. Open the queue, stage an action, then create your own application when you are ready.'
                  : 'Assemble catalog modules, describe a process, or install the purchasing demo to try queues and review with sample records.'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="demo-actions">
                  {demo ? <Link className="button button-primary" to="/p/$projectSlug" params={{ projectSlug: demo.slug }}>Open purchasing demo</Link>
                    : owner ? <Button disabled={Boolean(busy)} onPress={() => run('Installing purchasing demo…', async () => { await request('/api/kernel', { type: 'install_purchasing_demo' }); refresh() })}>{busy === 'Installing purchasing demo…' ? busy : 'Install purchasing demo'}</Button> : null}
                  {owner ? <Button variant="outline" disabled={Boolean(busy)} onPress={() => { setDraft(undefined); setPlanId(undefined); setSeedModules(undefined); setBuilding(true) }}>Create application</Button> : null}
                  {demo && owner ? <Button variant="ghost" disabled={Boolean(busy)} onPress={() => setRemoveOpen(true)}>Remove demo</Button> : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
          {!building && view === 'overview' && applications.length ? (
            <section className="stack" aria-label="Workspace applications"><div className="overview-section-heading"><h2>Your applications</h2><Link to="/applications">View all applications</Link></div>{applications.map(project => <Link className="overview-application-row" key={project.slug} to="/p/$projectSlug" params={{ projectSlug: project.slug }}><div><strong>{project.name}</strong><p className="muted">{project.description}</p></div><span>Open application</span></Link>)}</section>
          ) : null}
          {!building && view === 'overview' && demo && applications.length ? (
            <section className="stack" aria-label="Purchasing demo"><div className="overview-section-heading"><h2>Purchasing demo</h2><Badge variant="warning">Demo</Badge></div><Link className="overview-application-row" to="/p/$projectSlug" params={{ projectSlug: demo.slug }}><div><strong>{demo.name}</strong><p className="muted">{demo.description}</p></div><span>Open demo</span></Link></section>
          ) : null}
          {!building && view === 'applications' && applications.length ? (
            <section className="application-list" aria-label="Published applications"><h2>Published applications</h2><div className="project-grid">
              {applications.map(project => (
                <Link key={project.slug} to="/p/$projectSlug" params={{ projectSlug: project.slug }} className="card project-card">
                  <CardHeader>
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription>{project.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="muted">{projectKind(project)} · Published version {project.version}</p><span>Open application</span>
                  </CardContent>
                </Link>
              ))}
            </div></section>
          ) : null}
          {!building && view === 'applications' && demo && applications.length ? (
            <section className="application-list" aria-label="Purchasing demo"><div className="overview-section-heading"><h2>Purchasing demo</h2><Badge variant="warning">Demo</Badge></div><div className="project-grid">
              <Link to="/p/$projectSlug" params={{ projectSlug: demo.slug }} className="card project-card">
                <CardHeader>
                  <CardTitle>{demo.name}</CardTitle>
                  <CardDescription>{demo.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="muted">{projectKind(demo)} · Published version {demo.version}</p><span>Open demo</span>
                </CardContent>
              </Link>
            </div></section>
          ) : null}
        </div>
        <Dialog open={removeOpen} onOpenChange={setRemoveOpen} title="Remove the purchasing demo?" description="Sample records, proposals, and this application leave the workspace. Your other applications are not affected.">
          <div className="dialog-actions">
            <Button variant="outline" onPress={() => setRemoveOpen(false)}>Keep demo</Button>
            <Button variant="destructive" disabled={Boolean(busy)} onPress={() => run('Removing purchasing demo…', async () => { await request('/api/kernel', { type: 'remove_purchasing_demo' }); setRemoveOpen(false); refresh() })}>{busy === 'Removing purchasing demo…' ? busy : 'Remove demo'}</Button>
          </div>
        </Dialog>
      </main>
  )
}
