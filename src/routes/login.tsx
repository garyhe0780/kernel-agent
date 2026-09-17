import { pendingInvitation } from '@/lib/pending-invitation'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { AuthScreen } from '@/components/auth-screen'
import { Skeleton } from '@/components/ui/surfaces'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { mode: 'login' | 'signup'; code?: string } => {
    const code = typeof search.code === 'string' && search.code.trim() ? search.code.trim() : undefined
    return {
      mode: search.mode === 'login' ? 'login' : search.mode === 'signup' || code ? 'signup' : 'login',
      ...(code ? { code } : {}),
    }
  },
  head: ({ match }) => ({
    meta: [{ title: match.search.mode === 'signup' ? 'Create workspace — Kernel' : 'Sign in — Kernel' }],
  }),
  component: LoginPage,
})

function LoginPage() {
  const session = authClient.useSession()
  const { mode, code } = Route.useSearch()

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

  if (session.data) return <Navigate to={pendingInvitation() ? "/settings" : "/"} />
  return <AuthScreen mode={mode} invitationCode={code} />
}
