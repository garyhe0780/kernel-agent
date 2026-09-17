import { WorkspaceSwitcher } from './workspace-switcher'
import { clearWorkspaceSelection } from '@/lib/workspace-selection'
import { matchesView } from '@/kernel/application-views'
import { useEffect, useState, type ReactNode, type ComponentType } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { ClipboardCheck, ClipboardList, Contact, FolderKanban, Headphones, Laptop, Newspaper, Receipt, Users, LogOut, Settings2, SquareArrowOutUpRight, ChevronsUpDown, Layers3, LayoutGrid, Menu, X, Table2, Inbox, ArrowLeft, House, History, Bot, Plus, Star, Ellipsis, Boxes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/surfaces'
import { authClient } from '@/lib/auth-client'
import type { Snapshot } from '@/lib/client'

const projectIcons: Record<string, ComponentType<{ className?: string }>> = {
  site: Newspaper,
  'demo-purchasing': Receipt,
  procurement: Receipt,
  crm: Contact,
  orders: ClipboardList,
  helpdesk: Headphones,
  projects: FolderKanban,
  assets: Laptop,
  hr: Users,
  audit: ClipboardCheck,
}


export function LoadingShell() {
  return (
    <div className="app app-desk" aria-busy="true" aria-label="Loading workspace">
      <header className="desk-topbar"><div className="desk-topbar-app"><Skeleton className="h-8 w-32" /></div></header>
      <aside className="nav desk-nav" />
      <main className="main"><div className="main-body stack">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div></main>
    </div>
  )
}

export function ProjectFrame({
  snapshot,
  children,
  liveHref,
  configure,
  workspace = false,
  workspacePage: workspacePageProp,
  activeEntity,
  activeView,
  onViewChange,
  onEntityChange,
  onReview,
  reviewing,
  settingsNavigation,
  headerLocation,
}: {
  snapshot: Snapshot
  children: ReactNode
  liveHref?: string
  configure?: boolean
  workspace?: boolean
  workspacePage?: 'overview' | 'applications' | 'catalog' | 'inbox' | 'activity' | 'agents' | 'settings'
  activeView?: string
  onViewChange?: (id: string) => void
  activeEntity?: string
  onEntityChange?: (slug: string) => void
  onReview?: () => void
  reviewing?: boolean
  settingsNavigation?: (closeNavigation: () => void) => ReactNode
  headerLocation?: string
}) {
  const pathname = useRouterState({ select: s => s.location.pathname })
  const workspacePage = workspacePageProp ?? (pathname === '/applications' ? 'applications' : pathname === '/catalog' ? 'catalog' : pathname === '/inbox' ? 'inbox' : pathname === '/activity' ? 'activity' : pathname === '/agents' ? 'agents' : pathname === '/settings' ? 'settings' : 'overview')
  const slug = workspace ? '' : snapshot.project?.slug ?? ''
  const owner = snapshot.principal.role === 'owner'
  const [navOpen, setNavOpen] = useState(false)
  const favoriteKey = `kernel:favorites:${snapshot.principal.userId}:${snapshot.workspace.id}`
  const [favorites, setFavorites] = useState<string[]>([])
  const [favoriteSearch, setFavoriteSearch] = useState('')
  const [favoritesReady, setFavoritesReady] = useState(false)
  const [favoriteNotice, setFavoriteNotice] = useState('')
  useEffect(() => {
    setFavoritesReady(false); setFavoriteNotice('')
    try { const value = JSON.parse(localStorage.getItem(favoriteKey) || '[]'); setFavorites(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []) } catch { setFavorites([]) }
    setFavoritesReady(true)
  }, [favoriteKey])
  function toggleFavorite(slug: string) {
    const next = favorites.includes(slug) ? favorites.filter(item => item !== slug) : [...favorites, slug]
    setFavorites(next)
    try { localStorage.setItem(favoriteKey, JSON.stringify(next)); setFavoriteNotice('') } catch { setFavoriteNotice('Favorites could not be saved on this browser.') }
  }
  const favoriteProjects = favorites.map(favorite => snapshot.projects.find(project => project.slug === favorite)).filter(project => project !== undefined)
  const [moreFavoritesOpen, setMoreFavoritesOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const name = workspace ? 'Kernel' : snapshot.project?.name ?? snapshot.workspace.name
  const pending = snapshot.changes.filter(change => change.status === 'pending' && change.capability === activeEntity).length
  const reviewEntity = snapshot.capabilities.find(cap => cap.slug === activeEntity)?.definition.entity.label.toLowerCase() ?? 'record'
  const navigation = snapshot.project?.presentation?.navigation ?? snapshot.capabilities.map(cap => ({ entity: cap.slug, label: cap.definition.entity.label.endsWith('s') ? cap.definition.entity.label : `${cap.definition.entity.label}s` }))
  const reviewLabel = `Review ${reviewEntity.endsWith('s') ? reviewEntity : `${reviewEntity}s`}`
  return (
    <div className="app app-desk"><a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="desk-topbar">
        <div className="desk-topbar-app">
        {workspace ? <Link to="/" className="workspace-brand" aria-label="Kernel workspace" onClick={() => setNavOpen(false)}><span className="desk-app-icon"><Layers3 /></span><strong>Kernel</strong></Link> : <DialogTrigger isOpen={switcherOpen} onOpenChange={setSwitcherOpen}>
          <Button variant="ghost" className="app-switcher-trigger" aria-label={`Switch application, current application: ${name}`}>
            <span className="desk-app-icon"><Layers3 /></span><strong>{name}</strong><ChevronsUpDown />
          </Button>
          <Popover className="app-switcher-popover" placement="bottom start" offset={8} containerPadding={12}>
            <Dialog className="app-switcher-dialog" aria-label="Switch application">
              <nav className="app-switcher-list" aria-label="Applications">
                {snapshot.projects.map(project => <Link key={project.slug} to="/p/$projectSlug" params={{ projectSlug: project.slug }} aria-current={project.slug === slug ? 'page' : undefined} onClick={() => { setSwitcherOpen(false); setNavOpen(false) }}>{project.name}{project.demo ? <small>Demo</small> : null}</Link>)}
                <Link className="app-switcher-all" aria-current={workspace ? 'page' : undefined} to="/" onClick={() => { setSwitcherOpen(false); setNavOpen(false) }}>Back to workspace</Link>
              </nav>
            </Dialog>
          </Popover>
        </DialogTrigger>}
        </div>
        <div className="desk-header-context"><WorkspaceSwitcher workspace={snapshot.workspace} /><span className="desk-header-separator" aria-hidden="true">/</span><span className="desk-header-location">{headerLocation ?? (workspace ? workspacePage.charAt(0).toUpperCase() + workspacePage.slice(1) : configure ? `${name} · Configure` : name)}</span></div>
        <Button variant="ghost" size="icon" className="desk-navigation-toggle" aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} aria-controls="application-navigation" onPress={() => setNavOpen(!navOpen)}>{navOpen ? <X /> : <Menu />}</Button>
      </header>
      <aside id="application-navigation" className="nav desk-nav" data-open={navOpen}>
        <div className="desk-nav-scroll">
        {settingsNavigation ? settingsNavigation(() => setNavOpen(false)) : <>
        {!workspace ? <Link to="/" className="nav-item desk-back-link" onClick={() => setNavOpen(false)}><ArrowLeft /><span>Back to workspace</span></Link> : null}
        <nav className="nav-list" aria-label={workspace ? 'Workspace navigation' : `${name} navigation`}>
          {workspace ? <>
            <Link to="/" className="nav-item" activeOptions={{ exact: true }} aria-current={workspacePage === 'overview' ? 'page' : undefined} onClick={() => setNavOpen(false)}><House /><span>Overview</span></Link>
            <Link to="/applications" className="nav-item" aria-current={workspacePage === 'applications' ? 'page' : undefined} onClick={() => setNavOpen(false)}><LayoutGrid /><span>Applications</span></Link>
            <Link to="/catalog" className="nav-item" aria-current={workspacePage === 'catalog' ? 'page' : undefined} onClick={() => setNavOpen(false)}><Boxes /><span>Catalog</span></Link>
            <Link to="/inbox" className="nav-item" aria-current={workspacePage === 'inbox' ? 'page' : undefined} onClick={() => setNavOpen(false)}><Inbox /><span>Inbox</span></Link>
            <Link to="/activity" className="nav-item" aria-current={workspacePage === 'activity' ? 'page' : undefined} onClick={() => setNavOpen(false)}><History /><span>Activity</span></Link>
            {owner ? <Link to="/agents" className="nav-item" aria-current={workspacePage === 'agents' ? 'page' : undefined} onClick={() => setNavOpen(false)}><Bot /><span>Agents</span></Link> : null}
            {snapshot.projects.length ? <section className="workspace-favorites" aria-label="Favorite applications"><div className="favorites-heading"><span>Favorites</span><DialogTrigger><Button variant="ghost" size="icon" aria-label="Manage favorite applications" disabled={!favoritesReady}><Plus /></Button><Popover className="app-switcher-popover favorites-popover" placement="bottom start" offset={8}><Dialog className="app-switcher-dialog" aria-label="Manage favorite applications"><h2>Favorite applications</h2><p>Keep your frequent applications close. Saved in this browser.</p><label className="favorites-search-label">Find an application<input className="input" value={favoriteSearch} onChange={event => setFavoriteSearch(event.target.value)} placeholder="Search applications…" /></label><div className="favorites-options">{snapshot.projects.filter(project => project.name.toLowerCase().includes(favoriteSearch.toLowerCase())).map(project => <label key={project.slug}><input type="checkbox" checked={favorites.includes(project.slug)} onChange={() => toggleFavorite(project.slug)} /><span>{project.name}</span></label>)}{!snapshot.projects.some(project => project.name.toLowerCase().includes(favoriteSearch.toLowerCase())) ? <p>No applications match.</p> : null}</div>{favoriteNotice ? <p role="status">{favoriteNotice}</p> : null}</Dialog></Popover></DialogTrigger></div><div className="workspace-application-links">{favoriteProjects.slice(0, 3).map(project => {
              const Icon = projectIcons[project.slug] ?? Star
              return <Link key={project.slug} to="/p/$projectSlug" params={{ projectSlug: project.slug }} className="nav-item" title={project.name} onClick={() => setNavOpen(false)}><Icon /><span>{project.name}</span></Link>
            })}
              {favoriteProjects.length > 3 ? <DialogTrigger isOpen={moreFavoritesOpen} onOpenChange={setMoreFavoritesOpen}>
                <Button variant="ghost" className="nav-item favorites-more-trigger"><Ellipsis /><span>More</span></Button>
                <Popover className="app-switcher-popover favorites-more-popover" placement="bottom start" offset={6} containerPadding={12}>
                  <Dialog className="app-switcher-dialog" aria-label="All favorite applications">
                    <nav className="app-switcher-list" aria-label="All favorite applications">
                      {favoriteProjects.map(project => {
                        const Icon = projectIcons[project.slug] ?? Star
                        return <Link key={project.slug} to="/p/$projectSlug" params={{ projectSlug: project.slug }} onClick={() => { setMoreFavoritesOpen(false); setNavOpen(false) }}><Icon aria-hidden="true" /><span>{project.name}</span></Link>
                      })}
                    </nav>
                  </Dialog>
                </Popover>
              </DialogTrigger> : null}
            </div>{favoritesReady && !snapshot.projects.some(project => favorites.includes(project.slug)) ? <p className="favorites-hint">Pin an application with +</p> : null}</section> : null}
          </> : onEntityChange ? navigation.map(item => <div key={item.entity} className="desk-nav-section"><Button variant="ghost" className="nav-item" aria-current={!reviewing && !activeView && activeEntity === item.entity ? 'page' : undefined} onPress={() => { onEntityChange(item.entity); setNavOpen(false) }}><Table2 data-icon="inline-start" /><span>{item.label}</span><span className="nav-count">{snapshot.records.filter(r => r.capability === item.entity).length}</span></Button>{onViewChange ? snapshot.project?.presentation?.views.filter(view => view.entity === item.entity).map(view => <Button key={view.id} variant="ghost" className="nav-item desk-saved-view" aria-current={activeView === view.id ? 'page' : undefined} onPress={() => { onViewChange(view.id); setNavOpen(false) }}><span>{view.name}</span><span className="nav-count">{snapshot.records.filter(r => r.capability === view.entity && matchesView(r.data, view)).length}</span></Button>) : null}</div>) : <Link to="/p/$projectSlug" params={{ projectSlug: slug }} className="nav-item" aria-current={!configure ? 'page' : undefined}><Table2 /><span>{snapshot.project?.shell === 'site' ? 'Content' : snapshot.capability.definition.entity.label.endsWith('s') ? snapshot.capability.definition.entity.label : `${snapshot.capability.definition.entity.label}s`}</span></Link>}
          {onReview ? <Button variant="ghost" className="nav-item" aria-current={reviewing ? 'page' : undefined} onPress={() => { onReview(); setNavOpen(false) }}><Inbox data-icon="inline-start" /><span>{reviewLabel}</span><span className="nav-count">{pending}</span></Button> : null}
          {liveHref ? <a className="nav-item" href={liveHref}><SquareArrowOutUpRight />View live</a> : null}
        </nav>
        </>}
        </div>
        <div className="desk-nav-bottom">
          {workspace && owner && !settingsNavigation ? <Link to="/settings" className="nav-item" aria-current={workspacePage === 'settings' ? 'page' : undefined} onClick={() => setNavOpen(false)}><Settings2 /><span>Settings</span></Link> : null}
          {owner && slug ? <Link to="/p/$projectSlug/build" params={{ projectSlug: slug }} className="nav-item" aria-current={configure ? 'page' : undefined}><Settings2 /><span>Configure application</span></Link> : null}
          <div className="desk-account"><span className="desk-avatar">{snapshot.principal.name.slice(0, 1).toUpperCase()}</span><div><strong>{snapshot.principal.name}</strong><span>{snapshot.principal.role}</span></div><Button variant="ghost" size="icon" aria-label="Sign out" onPress={() => { clearWorkspaceSelection(); void authClient.signOut() }}><LogOut /></Button></div>
          <Link className="desk-powered" to="/" onClick={() => setNavOpen(false)}>Built with <strong>kernel.</strong></Link>
        </div>
      </aside>
      {children}
    </div>
  )
}
