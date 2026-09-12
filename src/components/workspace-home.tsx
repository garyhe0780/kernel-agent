import { useEffect, useState, type ComponentType } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { ClipboardCheck, ClipboardList, Contact, FolderKanban, Headphones, Laptop, LayoutGrid, LogOut, Newspaper, Receipt, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/surfaces'
import { projectKind } from '@/kernel/projects'
import { authClient } from '@/lib/auth-client'
import { request, type Snapshot } from '@/lib/client'

const projectIcons: Record<string, ComponentType<{ className?: string }>> = {
  site: Newspaper,
  procurement: Receipt,
  crm: Contact,
  orders: ClipboardList,
  helpdesk: Headphones,
  projects: FolderKanban,
  assets: Laptop,
  hr: Users,
  audit: ClipboardCheck,
}

export function WorkspaceHome() {
  const session = authClient.useSession()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session.data) {
      setSnapshot(null)
      return
    }
    let cancelled = false
    request<Snapshot>('/api/kernel')
      .then(next => { if (!cancelled) setSnapshot(next) })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load the workspace.') })
    return () => { cancelled = true }
  }, [session.data?.user.id])

  if (session.isPending) {
    return (
      <div className="loading-shell">
        <aside />
        <main>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-72 w-full" />
        </main>
      </div>
    )
  }
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot) {
    return error
      ? <main className="auth-page"><Alert variant="danger">{error}</Alert></main>
      : (
        <div className="loading-shell">
          <aside />
          <main>
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-72 w-full" />
          </main>
        </div>
      )
  }

  return (
    <div className="app">
      <aside className="nav">
        <a className="brand nav-brand" href="/"><span className="brand-mark">k</span><span>kernel<span className="brand-period">.</span></span></a>
        <nav className="nav-list" aria-label="Projects">
          {snapshot.projects.map(project => {
            const Icon = projectIcons[project.slug] ?? LayoutGrid
            return (
              <Link key={project.slug} to="/p/$projectSlug" params={{ projectSlug: project.slug }} className="nav-item">
                <Icon />
                {project.name}
              </Link>
            )
          })}
        </nav>
        <div className="nav-dock">
        <div className="nav-user">
          <strong>{snapshot.principal.name}</strong>
          <span>{snapshot.workspace.name} · {snapshot.principal.role}</span>
          <Button variant="ghost" size="sm" onPress={() => authClient.signOut()}>
            <LogOut data-icon="inline-start" />
            Sign out
          </Button>
        </div>
        </div>
      </aside>
      <div className="main">
        <header className="main-header">
          <div>
            <h1>Projects</h1>
            <p>Open a product to do the work.</p>
          </div>
        </header>
        <div className="main-body">
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {snapshot.projects.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No projects</CardTitle>
                <CardDescription>This workspace has no projects yet.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="project-grid">
              {snapshot.projects.map(project => (
                <Link key={project.slug} to="/p/$projectSlug" params={{ projectSlug: project.slug }} className="card project-card">
                  <CardHeader>
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription>{project.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="muted">{projectKind(project)}</p>
                  </CardContent>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
