import { createContext, useContext, useEffect, useState } from 'react'
import { Navigate, Outlet } from '@tanstack/react-router'
import { LoadingShell, ProjectFrame } from './project-frame'
import { Alert } from './ui/surfaces'
import { Button } from './ui/button'
import { authClient } from '@/lib/auth-client'
import { request, type Snapshot } from '@/lib/client'

const WorkspaceContext = createContext<Snapshot | null>(null)
const WorkspaceRefreshContext = createContext<() => void>(() => {})

export function useWorkspaceSnapshot() {
  const snapshot = useContext(WorkspaceContext)
  if (!snapshot) throw new Error('Workspace pages must render inside the workspace layout.')
  return snapshot
}

export function useRefreshWorkspace() {
  return useContext(WorkspaceRefreshContext)
}

export function WorkspaceLayout() {
  const session = authClient.useSession()
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!session.data) {
      setSnapshot(undefined)
      return
    }
    let cancelled = false
    setError('')
    request<Snapshot>('/api/kernel')
      .then(next => { if (!cancelled) setSnapshot(next) })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load the workspace.') })
    return () => { cancelled = true }
  }, [session.data?.user.id, revision])

  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot) {
    return error
      ? <main className="auth-page"><a href="/?workspace=default">Return to default workspace</a><Alert variant="danger">{error}</Alert><Button onPress={() => setRevision(value => value + 1)}>Try again</Button></main>
      : <LoadingShell />
  }

  if (snapshot.principal.role === 'application' && snapshot.projects.length === 1) {
    return <Navigate to="/p/$projectSlug" params={{ projectSlug: snapshot.projects[0].slug }} />
  }
  if (snapshot.principal.role === 'application' && snapshot.projects.length === 0) {
    return <main className="auth-page"><h1>No application access</h1><p>Ask the person who invited you for a new link.</p></main>
  }

  return (
    <WorkspaceContext.Provider value={snapshot}>
      <WorkspaceRefreshContext.Provider value={() => setRevision(value => value + 1)}>
      <ProjectFrame snapshot={snapshot} workspace>
        <Outlet />
      </ProjectFrame>
      </WorkspaceRefreshContext.Provider>
    </WorkspaceContext.Provider>
  )
}
