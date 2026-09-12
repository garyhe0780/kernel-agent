import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { LogOut, Settings2, SquareArrowOutUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/surfaces'
import { authClient } from '@/lib/auth-client'
import type { Snapshot } from '@/lib/client'

export function LoadingShell() {
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

export function ProjectFrame({
  snapshot,
  children,
  liveHref,
  configure,
}: {
  snapshot: Snapshot
  children: ReactNode
  liveHref?: string
  configure?: boolean
}) {
  const slug = snapshot.project?.slug ?? ''
  const owner = snapshot.principal.role === 'owner'
  return (
    <div className="app">
      <aside className="nav">
        <a className="brand nav-brand" href="/"><span className="brand-mark">k</span><span>kernel<span className="brand-period">.</span></span></a>
        {slug ? (
          <Link to="/p/$projectSlug" params={{ projectSlug: slug }} className="nav-project nav-project-link">{snapshot.project?.name}</Link>
        ) : (
          <p className="nav-project">{snapshot.workspace.name}</p>
        )}
        <nav className="nav-list" aria-label="Project">
          <Link to="/" className="nav-item">All projects</Link>
          {liveHref ? (
            <a className="nav-item" href={liveHref}>
              <SquareArrowOutUpRight />
              View live
            </a>
          ) : null}
          {owner && slug ? (
            <Link
              to="/p/$projectSlug/build"
              params={{ projectSlug: slug }}
              className="nav-item"
              aria-current={configure ? 'page' : undefined}
            >
              <Settings2 />
              Configure
            </Link>
          ) : null}
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
      {children}
    </div>
  )
}
