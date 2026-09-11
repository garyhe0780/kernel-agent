import { createFileRoute, Navigate } from '@tanstack/react-router'
import { AuthScreen } from '@/components/auth-screen'
import { Skeleton } from '@/components/ui/surfaces'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === 'signup' ? 'signup' as const : 'login' as const,
  }),
  head: ({ match }) => ({
    meta: [{ title: match.search.mode === 'signup' ? 'Create workspace — Kernel' : 'Sign in — Kernel' }],
  }),
  component: LoginPage,
})

function LoginPage() {
  const session = authClient.useSession()
  const { mode } = Route.useSearch()

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

  if (session.data) return <Navigate to="/" />
  return <AuthScreen mode={mode} />
}
