import { ApplicationStudio } from './application-studio'
import type { BuilderPlan } from '@/kernel/builder-plan'
import { LoadingShell, ProjectFrame } from './project-frame'
import type { Draft } from '@/kernel/application'
import { useEffect, useState } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surfaces'
import { projectKind } from '@/kernel/projects'
import { authClient } from '@/lib/auth-client'
import { request, type Snapshot } from '@/lib/client'


export function WorkspaceHome({ view = 'overview' }: { view?: 'overview' | 'applications' }) {
  const session = authClient.useSession()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [workLoaded, setWorkLoaded] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [model, setModel] = useState({ configured: false, model: null as string | null })
  const [building, setBuilding] = useState(false)
  const [plans, setPlans] = useState<BuilderPlan[]>([])
  const [planId, setPlanId] = useState<string>()
  const [draft, setDraft] = useState<Draft>()

  useEffect(() => {
    if (!session.data) {
      setSnapshot(null)
      return
    }
    let cancelled = false
    request<Snapshot>('/api/kernel')
      .then(async next => {
        if (!cancelled) setSnapshot(next)
        if (next.principal.role === 'owner') {
          const data = await request<{ drafts: Draft[]; model: typeof model }>('/api/kernel?drafts=1')
          if (!cancelled) { setDrafts(data.drafts); setModel(data.model); setPlans(await request<BuilderPlan[]>('/api/kernel?plans=1')); setWorkLoaded(true) }
        }
      })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load the workspace.') })
    return () => { cancelled = true }
  }, [session.data?.user.id])

  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot) {
    return error
      ? <main className="auth-page"><a href="/?workspace=default">Return to default workspace</a><Alert variant="danger">{error}</Alert></main>
      : <LoadingShell />
  }

  return (
    <ProjectFrame snapshot={snapshot} workspace workspacePage={view}>
      <main className="main" id="main-content" tabIndex={-1}>
        <header className="main-header" hidden={building}>
          <div>
            <h1>{building ? 'Create application' : view === 'overview' ? 'Overview' : 'Applications'}</h1>
            <p>{building ? 'Describe, try, and refine your application before publishing.' : view === 'overview' ? 'Pick up your work or open an application.' : 'Build the tools your business needs. Let agents help run them.'}</p>
          </div>
          {snapshot.principal.role === 'owner' && !building ? <Button onPress={() => { setDraft(undefined); setPlanId(undefined); setBuilding(true) }}>Create application</Button> : null}
        </header>
        <div className="main-body workspace-home-body">
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {building ? <ApplicationStudio key={planId ?? draft?.id ?? 'new'} planId={planId} draft={draft} model={model} onSaved={next => setDrafts(current => [next, ...current.filter(d => d.id !== next.id)])} onClose={() => { setBuilding(false); request<BuilderPlan[]>('/api/kernel?plans=1').then(setPlans).catch(e => setError(e.message)) }} /> : null}
          {!building && view === 'overview' && workLoaded && snapshot.principal.role === 'owner' && !plans.some(p => p.status !== 'generated') && !drafts.length ? <section className="stack"><h2>Ready for your next idea</h2><p className="muted">No saved plans or drafts to continue. Create an application when you’re ready.</p></section> : null}
          {!building && plans.some(p => p.status !== 'generated') ? <section className="stack" aria-label="Saved plans"><h2>Continue planning</h2>{plans.filter(p => p.status !== 'generated').map(p => <div className="draft-row" key={p.id}><div><strong>{p.content.proposal?.plan.name || p.content.request.slice(0, 80)}</strong><p className="muted">Saved plan · {p.status === 'confirmed' ? 'Ready to build' : 'In progress'}</p></div><Button variant="outline" onPress={() => { setPlanId(p.id); setDraft(drafts.find(d => d.id === p.draftId)); setBuilding(true) }}>Open plan</Button></div>)}</section> : null}
          {!building && drafts.length ? <section className="stack" aria-label="Saved drafts"><h2>Continue building</h2>{drafts.map(item => <div className="draft-row" key={item.id}><div><strong>{item.definition.name}</strong><p className="muted">{item.baseProjectVersion ? `Application v${item.baseProjectVersion} changes` : 'Draft'} · revision {item.version} · {item.definition.entities.length} entities</p></div><Button variant="outline" onPress={() => { setDraft(item); setPlanId(undefined); setBuilding(true) }}>Open draft</Button></div>)}</section> : null}
          {!building && snapshot.projects.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Your first business application starts here</CardTitle>
                <CardDescription>Create an application from a description, or explore the purchasing example. Your data and workflows will live in their own project.</CardDescription>
              </CardHeader>
            </Card>
          ) : !building && view === 'overview' ? (
            <section className="stack" aria-label="Workspace applications"><div className="overview-section-heading"><h2>Your applications</h2><a href="/applications">View all applications</a></div>{snapshot.projects.map(project => <Link className="overview-application-row" key={project.slug} to="/p/$projectSlug" params={{ projectSlug: project.slug }}><div><strong>{project.name}</strong><p className="muted">{project.description}</p></div><span>Open application</span></Link>)}</section>
          ) : !building ? (
            <section className="application-list" aria-label="Published applications"><h2>Published applications</h2><div className="project-grid">
              {snapshot.projects.map(project => (
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
        </div>
      </main>
    </ProjectFrame>
  )
}
