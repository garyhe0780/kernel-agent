import { pendingInvitation } from '@/lib/pending-invitation'
import { useEffect, useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { AuthScreen, type AuthMode } from '@/components/auth-screen'
import { Alert, Skeleton } from '@/components/ui/surfaces'
import { authClient } from '@/lib/auth-client'
import { request } from '@/lib/client'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { mode: AuthMode; code?: string; app?: string; token?: string; error?: string } => {
    const code = typeof search.code === 'string' && search.code.trim() ? search.code.trim() : undefined
    const app = typeof search.app === 'string' && search.app.trim() ? search.app.trim() : undefined
    return {
      mode: search.mode === 'forgot' || search.mode === 'reset' || search.mode === 'reset-done' ? search.mode : search.mode === 'login' ? 'login' : search.mode === 'signup' || code || app ? 'signup' : 'login',
      ...(typeof search.token === 'string' ? { token: search.token } : {}),
      ...(typeof search.error === 'string' ? { error: search.error } : {}),
      ...(code ? { code } : {}),
      ...(app ? { app } : {}),
    }
  },
  head: ({ match }) => ({
    meta: [{ title: match.search.mode === 'forgot' || match.search.mode === 'reset' || match.search.mode === 'reset-done' ? 'Reset password — Kernel' : match.search.app ? 'Join application — Kernel' : match.search.mode === 'signup' ? 'Create workspace — Kernel' : 'Sign in — Kernel' }],
  }),
  component: LoginPage,
})

function JoinApplication({ token }: { token: string }) {
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    request<{ workspaceId: string; projectSlug: string }>('/api/kernel', { type: 'accept_application_invite', token })
      .then(result => {
        if (!cancelled) window.location.assign(`/p/${encodeURIComponent(result.projectSlug)}?workspace=${encodeURIComponent(result.workspaceId)}`)
      })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to join this application.') })
    return () => { cancelled = true }
  }, [token])
  return (
    <main className="auth-page">
      <h1>{error ? 'Invitation unavailable' : 'Opening your application'}</h1>
      {error ? <Alert variant="danger">{error}</Alert> : <p>Signing you in to the application you were invited to.</p>}
    </main>
  )
}

function LoginPage() {
  const session = authClient.useSession()
  const { mode, code, app, token, error } = Route.useSearch()

  if (session.isPending && session.data === undefined) {
    return (
      <main className="auth-layout" aria-busy="true" aria-label="Loading sign in">
        <section className="auth-story" />
        <section className="auth-form-area">
          <div className="auth-form-wrap">
            <Skeleton className="size-12" />
            <Skeleton className="h-10 w-52" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </section>
      </main>
    )
  }

  if (session.data && app && mode !== 'forgot' && mode !== 'reset' && mode !== 'reset-done') return <JoinApplication token={app} />
  if (session.data && mode !== 'forgot' && mode !== 'reset' && mode !== 'reset-done') return <Navigate to={pendingInvitation() ? "/settings" : "/workspace"} />
  return <AuthScreen token={token} resetError={error} mode={mode} invitationCode={code} applicationInvite={app} />
}
