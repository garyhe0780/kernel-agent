import { useEffect, useState } from 'react'
import { Navigate } from '@tanstack/react-router'
import { AccountMembers } from './account-members'
import { ProjectFrame, LoadingShell } from './project-frame'
import { Alert } from './ui/surfaces'
import { Button } from './ui/button'
import { authClient } from '@/lib/auth-client'
import { request, type Snapshot } from '@/lib/client'

export function ApplicationMembers({ projectSlug }: { projectSlug: string }) {
  const session = authClient.useSession()
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!session.data) return
    let active = true
    setSnapshot(undefined)
    setError('')
    request<Snapshot>(`/api/kernel?project=${encodeURIComponent(projectSlug)}`)
      .then((value) => {
        if (active) setSnapshot(value)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [projectSlug, session.data?.user.id, revision])
  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot)
    return error ? (
      <main className="auth-page">
        <Alert variant="danger">{error}</Alert>
        <Button onPress={() => setRevision((value) => value + 1)}>
          Try again
        </Button>
      </main>
    ) : (
      <LoadingShell />
    )
  return (
    <ProjectFrame snapshot={snapshot} headerLocation="Manage account / Members">
      <main className="main members-page" id="main-content" tabIndex={-1}>
        {snapshot.principal.role === 'owner' ? (
          <AccountMembers
            key={projectSlug}
            project={projectSlug}
            accountName={snapshot.project?.name ?? projectSlug}
            userId={snapshot.principal.userId}
          />
        ) : (
          <Alert>Only workspace owners can manage application members.</Alert>
        )}
      </main>
    </ProjectFrame>
  )
}
