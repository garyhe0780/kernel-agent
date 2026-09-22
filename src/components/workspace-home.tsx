import { ApplicationStudio } from './application-studio'
import type { BuilderPlan } from '@/kernel/builder-plan'
import type { Draft } from '@/kernel/application'
import { useRefreshWorkspace, useWorkspaceSnapshot } from './workspace-layout'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surfaces'
import { Dialog } from './ui/dialog'
import { projectKind } from '@/kernel/projects'
import { moduleById } from '@/kernel/modules'
import { patternById } from '@/kernel/patterns'
import { request } from '@/lib/client'
import { WorkspaceActionLink, WorkspaceEntityCard } from './workspace-entity-card'


export function WorkspaceHome({ view = 'overview', assemble, pattern }: { view?: 'overview' | 'applications'; assemble?: string; pattern?: string }) {
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
  const savedPlans = plans.filter(p => p.status !== 'generated')

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

  useEffect(() => {
    if (!pattern || !owner || !patternById(pattern)) return
    const chosen = pattern
    let cancelled = false
    setBuilding(true)
    setDraft(undefined)
    setPlanId(undefined)
    setSeedModules(undefined)
    request<Draft>('/api/kernel', { type: 'save_draft', brief: `${patternById(chosen)!.name} assembled from the catalog pattern.`, pattern: chosen })
      .then(next => {
        if (cancelled) return
        setDraft(next)
        setPlanId(undefined)
        setSeedModules(undefined)
        void navigate({ to: '/applications', search: {}, replace: true })
      })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to open this pattern.') })
    return () => { cancelled = true }
  }, [pattern, owner, navigate])

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label); setError('')
    try { await work() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update the purchasing demo.') }
    finally { setBusy('') }
  }

  const firstRun = !building && applications.length === 0
  const overviewIdle = view === 'overview' && workLoaded && owner && !savedPlans.length && !drafts.length

  return (
    <main className="main" id="main-content" tabIndex={-1}>
        <header className="main-header" hidden={building}>
          <div>
            <h1>{building ? 'Create application' : view === 'overview' ? 'Overview' : 'Applications'}</h1>
            <p>{building ? 'Describe, try, and refine your application before publishing.' : view === 'overview' ? 'Pick up your work or open an application.' : 'Build the tools your business needs. Let agents help run them.'}</p>
          </div>
          {owner && !building ? <Button onPress={() => { setDraft(undefined); setPlanId(undefined); setSeedModules(undefined); setBuilding(true) }}>Create application</Button> : null}
        </header>
        <div className={building ? 'main-body' : 'main-body workspace-home-body'}>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {building ? <ApplicationStudio key={planId ?? draft?.id ?? seedModules?.join(',') ?? 'new'} planId={planId} draft={draft} seedModules={draft || planId ? undefined : seedModules} model={model} onSaved={next => setDrafts(current => [next, ...current.filter(d => d.id !== next.id)])} onClose={() => { setBuilding(false); setSeedModules(undefined); request<BuilderPlan[]>('/api/kernel?plans=1').then(setPlans).catch(e => setError(e.message)) }} /> : null}
          {!building && overviewIdle && !firstRun ? <section className="stack"><h2>Ready for your next idea</h2><p className="muted">No saved plans or drafts to continue. Create an application when you’re ready.</p></section> : null}
          {!building && savedPlans.length ? <section className={view === 'applications' ? 'application-list' : 'stack'} aria-label="Saved plans"><h2>Continue planning</h2><div className={view === 'applications' ? 'project-grid' : 'stack'}>{savedPlans.map(p => <WorkspaceEntityCard key={p.id} className={view === 'applications' ? 'project-card' : undefined} title={p.content.proposal?.plan.name || p.content.request.slice(0, 80)} description={`Saved plan · ${p.status === 'confirmed' ? 'Ready to build' : 'In progress'}`} actions={<Button variant="outline" onPress={() => { setPlanId(p.id); setDraft(drafts.find(d => d.id === p.draftId)); setBuilding(true) }}>Open plan<ArrowRight data-icon="inline-end" /></Button>} />)}</div></section> : null}
          {!building && drafts.length ? <section className="stack" aria-label="Saved drafts"><h2>Continue building</h2>{drafts.map(item => <WorkspaceEntityCard key={item.id} title={item.definition.name} description={`${item.baseProjectVersion ? `Application v${item.baseProjectVersion} changes` : 'Draft'} · revision ${item.version} · ${item.assembly ? `${item.assembly.modules.length} modules` : `${item.definition.entities.length} entities`}`} actions={<Button variant="outline" onPress={() => { setDraft(item); setPlanId(undefined); setBuilding(true) }}>Open draft<ArrowRight data-icon="inline-end" /></Button>} />)}</section> : null}
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
            <section className="stack" aria-label="Workspace applications"><div className="overview-section-heading"><h2>Your applications</h2><Link to="/applications">View all applications</Link></div>{applications.map(project => <WorkspaceEntityCard key={project.slug} title={project.name} description={project.description} actions={<WorkspaceActionLink to="/p/$projectSlug" params={{ projectSlug: project.slug }}>Open application</WorkspaceActionLink>} />)}</section>
          ) : null}
          {!building && view === 'overview' && demo && applications.length ? (
            <section className="stack" aria-label="Purchasing demo"><h2>Purchasing demo</h2><WorkspaceEntityCard title={demo.name} description={demo.description} badge={<Badge variant="warning">Demo</Badge>} actions={<WorkspaceActionLink to="/p/$projectSlug" params={{ projectSlug: demo.slug }}>Open demo</WorkspaceActionLink>} /></section>
          ) : null}
          {!building && view === 'applications' && applications.length ? (
            <section className="application-list" aria-label="Published applications"><h2>Published applications</h2><div className="project-grid">
              {applications.map(project => (
                <WorkspaceEntityCard key={project.slug} className="project-card" title={project.name} description={project.description} actions={<WorkspaceActionLink to="/p/$projectSlug" params={{ projectSlug: project.slug }}>Open application</WorkspaceActionLink>}>
                  <p className="muted">{projectKind(project)} · Published version {project.version}</p>
                </WorkspaceEntityCard>
              ))}
            </div></section>
          ) : null}
          {!building && view === 'applications' && demo && applications.length ? (
            <section className="application-list" aria-label="Purchasing demo"><h2>Purchasing demo</h2><div className="project-grid">
              <WorkspaceEntityCard className="project-card" title={demo.name} description={demo.description} badge={<Badge variant="warning">Demo</Badge>} actions={<WorkspaceActionLink to="/p/$projectSlug" params={{ projectSlug: demo.slug }}>Open demo</WorkspaceActionLink>}>
                <p className="muted">{projectKind(demo)} · Published version {demo.version}</p>
              </WorkspaceEntityCard>
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
