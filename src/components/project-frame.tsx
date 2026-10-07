import { AssignmentMembers } from './record-context'
import { WorkspaceSwitcher } from './workspace-switcher'
import { FrameBreadcrumbContext, type FrameBreadcrumbItem } from './frame-breadcrumb'
import { entityNavigationIcon } from './navigation-icons'
import type { NavigationItem } from '@/kernel/application-views'
import { clearWorkspaceSelection } from '@/lib/workspace-selection'
import { useEffect, useState, type ReactNode, type ComponentType } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { ClipboardCheck, ClipboardList, Contact, FolderKanban, Headphones, Laptop, Newspaper, Receipt, Users, LogOut, Settings, Settings2, ChevronRight, SquareArrowOutUpRight, ChevronsUpDown, Layers3, LayoutGrid, Menu, X, Inbox, House, History, Bot, Plus, Ellipsis, Boxes, CircleHelp, UserRound, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
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

function applicationNavigationIcon(project: Snapshot['project'], capabilities: Snapshot['capabilities'] = []) {
  const presentation = project?.presentation
  const startEntity = presentation?.views.find(view => view.id === presentation.startView)?.entity
  const item = presentation?.navigation.find(item => item.entity === startEntity) ?? presentation?.navigation[0]
  if (item) return entityNavigationIcon(item, capabilities.find(capability => capability.slug === item.entity)?.definition)
  return projectIcons[project?.slug ?? ''] ?? Layers3
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
  workspacePage?: 'overview' | 'applications' | 'catalog' | 'inbox' | 'activity' | 'agents' | 'settings' | 'members'
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
  const workspacePage = workspacePageProp ?? (pathname === '/members' ? 'members' : pathname === '/applications' ? 'applications' : pathname === '/catalog' ? 'catalog' : pathname === '/inbox' ? 'inbox' : pathname === '/activity' ? 'activity' : pathname === '/agents' ? 'agents' : pathname === '/settings' ? 'settings' : 'overview')
  const slug = workspace ? '' : snapshot.project?.slug ?? ''
  const owner = snapshot.principal.role === 'owner'
  const applicationUser = snapshot.principal.role === 'application'
  const roleLabel = applicationUser ? 'Member' : snapshot.principal.role
  const [navOpen, setNavOpen] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (activeEntity) setExpandedSections(current => ({ ...current, [activeEntity]: true }))
  }, [activeEntity, activeView])
  const [breadcrumbs, setBreadcrumbs] = useState<FrameBreadcrumbItem[] | null>(null)
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
  const reviewEntity = snapshot.capabilities.find(cap => cap.slug === activeEntity)?.definition.entity.label.toLowerCase() ?? 'record'
  const navigation: NavigationItem[] = snapshot.project?.presentation?.navigation ?? snapshot.capabilities.map(cap => ({ entity: cap.slug, label: cap.definition.entity.label.endsWith('s') ? cap.definition.entity.label : `${cap.definition.entity.label}s` }))
  const ApplicationIcon = applicationNavigationIcon(snapshot.project, snapshot.capabilities)
  const PrimaryEntityIcon = entityNavigationIcon({}, snapshot.capability.definition)
  const reviewLabel = `Review ${reviewEntity.endsWith('s') ? reviewEntity : `${reviewEntity}s`}`
  const currentLocation = headerLocation ?? (workspace
    ? workspacePage === 'members' ? 'Manage account / Members' : workspacePage.charAt(0).toUpperCase() + workspacePage.slice(1)
    : configure ? `${name} · Configure`
    : reviewing ? reviewLabel
    : activeView ? snapshot.project?.presentation?.views.find(view => view.id === activeView)?.name ?? name
    : navigation.find(item => item.entity === activeEntity)?.label ?? name)
  const headerTrail: FrameBreadcrumbItem[] = breadcrumbs ?? (!workspace && !headerLocation && onEntityChange && activeEntity
    ? [{ label: navigation.find(item => item.entity === activeEntity)?.label ?? name, ...(activeView || reviewing ? { onPress: () => onEntityChange(activeEntity) } : {}) }, ...(activeView || reviewing ? [{ label: currentLocation }] : [])]
    : currentLocation.split(/ \/ | · /).map(label => ({ label })))
  const showSettingsIcon = !breadcrumbs && (Boolean(settingsNavigation) || configure || currentLocation.startsWith('Manage account'))
  function navigateApplication(action: () => void) {
    action()
    setNavOpen(false)
    if (navOpen) requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true }))
  }
  return (
    <div className="app app-desk" data-application={!workspace} data-nav-collapsed={navCollapsed}><a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="desk-topbar">
        <div className="desk-topbar-app">
          {workspace ? <>
            <Link to="/workspace" className="workspace-brand" aria-label="Kernel workspace" onClick={() => setNavOpen(false)}><span className="desk-app-icon"><Layers3 aria-hidden="true" /></span></Link>
            {applicationUser ? <strong className="desk-workspace-label">{snapshot.workspace.name}</strong> : <WorkspaceSwitcher workspace={snapshot.workspace} />}
          </> : <>{applicationUser && snapshot.projects.length < 2 ? <span className="app-switcher-trigger"><span className="desk-app-icon"><ApplicationIcon aria-hidden="true" /></span><strong>{name}</strong></span> : <DialogTrigger isOpen={switcherOpen} onOpenChange={setSwitcherOpen}>
          <Button variant="ghost" className="app-switcher-trigger" aria-label={`Switch application, current application: ${name}`}>
            <span className="desk-app-icon"><ApplicationIcon aria-hidden="true" /></span><strong>{name}</strong><ChevronsUpDown />
          </Button>
          <Popover className="app-switcher-popover" placement="bottom start" offset={8} containerPadding={12}>
            <Dialog className="app-switcher-dialog" aria-label="Switch application">
              <nav className="app-switcher-list" aria-label="Applications">
                {snapshot.projects.map(project => <Link key={project.slug} to="/p/$projectSlug" params={{ projectSlug: project.slug }} aria-current={project.slug === slug ? 'page' : undefined} onClick={() => { setSwitcherOpen(false); setNavOpen(false) }}>{project.name}{project.demo ? <small>Demo</small> : null}</Link>)}
                {owner ? <Link className="app-switcher-all" aria-current={workspace ? 'page' : undefined} to="/workspace" onClick={() => { setSwitcherOpen(false); setNavOpen(false) }}>Back to workspace</Link> : null}
              </nav>
            </Dialog>
          </Popover>
        </DialogTrigger>}</>}
        </div>
        <div className="desk-header-context">
          <nav className="desk-header-breadcrumb" aria-label="Breadcrumb">
            {headerTrail.map((item, index) => <span key={`${index}-${item.label}`} aria-current={index === headerTrail.length - 1 ? 'page' : undefined}>{index > 0 ? <ChevronRight aria-hidden="true" /> : showSettingsIcon ? <Settings2 aria-hidden="true" /> : null}{item.onPress ? <button type="button" onClick={item.onPress}>{item.label}</button> : <span title={item.label}>{item.label}</span>}</span>)}
          </nav>
          <div className="desk-header-utilities">
            <Link to="/docs" className="desk-help-link" aria-label="Help"><CircleHelp aria-hidden="true" /><span>Help</span></Link>
            <DialogTrigger>
              <Button variant="ghost" size="icon" aria-label={`Account menu for ${snapshot.principal.name}`}><UserRound /></Button>
              <Popover className="app-switcher-popover desk-profile-popover" placement="bottom end" offset={8}>
                <Dialog className="app-switcher-dialog" aria-label="Your account">
                  <div className="desk-profile-identity"><strong>{snapshot.principal.name}</strong><span>{roleLabel}</span></div>
                  <Button variant="ghost" onPress={() => { clearWorkspaceSelection(); void authClient.signOut() }}><LogOut data-icon="inline-start" />Sign out</Button>
                </Dialog>
              </Popover>
            </DialogTrigger>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="desk-navigation-toggle" aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} aria-controls="application-navigation" onPress={() => setNavOpen(!navOpen)}>{navOpen ? <X /> : <Menu />}</Button>
      </header>
      <aside id="application-navigation" className="nav desk-nav" data-open={navOpen}>
        <div className="desk-nav-scroll" id="desk-navigation-directory">

        {settingsNavigation ? settingsNavigation(() => setNavOpen(false)) : <>
        <nav className="nav-list" aria-label={workspace ? 'Workspace navigation' : `${name} navigation`}>
          {workspace ? <>
            <Link to="/workspace" className="nav-item" activeOptions={{ exact: true }} aria-current={workspacePage === 'overview' ? 'page' : undefined} onClick={() => setNavOpen(false)}><House /><span>Overview</span></Link>
            <p className="desk-nav-label">Build</p>
            <Link to="/applications" className="nav-item" aria-current={workspacePage === 'applications' ? 'page' : undefined} onClick={() => setNavOpen(false)}><LayoutGrid /><span>Applications</span></Link>
            {applicationUser ? null : <Link to="/catalog" className="nav-item" aria-current={workspacePage === 'catalog' ? 'page' : undefined} onClick={() => setNavOpen(false)}><Boxes /><span>Catalog</span></Link>}
            {applicationUser ? null : <p className="desk-nav-label">Observe</p>}
            {applicationUser ? null : <Link to="/inbox" className="nav-item" aria-current={workspacePage === 'inbox' ? 'page' : undefined} onClick={() => setNavOpen(false)}><Inbox /><span>Inbox</span></Link>}
            {applicationUser ? null : <Link to="/activity" className="nav-item" aria-current={workspacePage === 'activity' ? 'page' : undefined} onClick={() => setNavOpen(false)}><History /><span>Activity</span></Link>}
            {owner ? <Link to="/agents" className="nav-item" aria-current={workspacePage === 'agents' ? 'page' : undefined} onClick={() => setNavOpen(false)}><Bot /><span>Agents</span></Link> : null}
            {snapshot.projects.length ? <section className="workspace-favorites" aria-label="Favorite applications"><div className="favorites-heading"><span>Favorites</span><DialogTrigger><Button variant="ghost" size="icon" aria-label="Manage favorite applications" disabled={!favoritesReady}><Plus /></Button><Popover className="app-switcher-popover favorites-popover" placement="bottom start" offset={8}><Dialog className="app-switcher-dialog" aria-label="Manage favorite applications"><h2>Favorite applications</h2><p>Keep your frequent applications close. Saved in this browser.</p><label className="favorites-search-label">Find an application<input className="input" value={favoriteSearch} onChange={event => setFavoriteSearch(event.target.value)} placeholder="Search applications…" /></label><div className="favorites-options">{snapshot.projects.filter(project => project.name.toLowerCase().includes(favoriteSearch.toLowerCase())).map(project => <label key={project.slug}><input type="checkbox" checked={favorites.includes(project.slug)} onChange={() => toggleFavorite(project.slug)} /><span>{project.name}</span></label>)}{!snapshot.projects.some(project => project.name.toLowerCase().includes(favoriteSearch.toLowerCase())) ? <p>No applications match.</p> : null}</div>{favoriteNotice ? <p role="status">{favoriteNotice}</p> : null}</Dialog></Popover></DialogTrigger></div><div className="workspace-application-links">{favoriteProjects.slice(0, 3).map(project => {
              const Icon = applicationNavigationIcon(project)
              return <Link key={project.slug} to="/p/$projectSlug" params={{ projectSlug: project.slug }} className="nav-item" title={project.name} onClick={() => setNavOpen(false)}><Icon /><span>{project.name}</span></Link>
            })}
              {favoriteProjects.length > 3 ? <DialogTrigger isOpen={moreFavoritesOpen} onOpenChange={setMoreFavoritesOpen}>
                <Button variant="ghost" className="nav-item favorites-more-trigger"><Ellipsis /><span>More</span></Button>
                <Popover className="app-switcher-popover favorites-more-popover" placement="bottom start" offset={6} containerPadding={12}>
                  <Dialog className="app-switcher-dialog" aria-label="All favorite applications">
                    <nav className="app-switcher-list" aria-label="All favorite applications">
                      {favoriteProjects.map(project => {
                        const Icon = applicationNavigationIcon(project)
                        return <Link key={project.slug} to="/p/$projectSlug" params={{ projectSlug: project.slug }} onClick={() => { setMoreFavoritesOpen(false); setNavOpen(false) }}><Icon aria-hidden="true" /><span>{project.name}</span></Link>
                      })}
                    </nav>
                  </Dialog>
                </Popover>
              </DialogTrigger> : null}
            </div>{favoritesReady && !snapshot.projects.some(project => favorites.includes(project.slug)) ? <p className="favorites-hint">Pin an application to keep it here.</p> : null}</section> : null}
          </> : onEntityChange ? navigation.map(item => {
            const views = snapshot.project?.presentation?.views.filter(view => view.entity === item.entity) ?? []
            const EntityIcon = entityNavigationIcon(item, snapshot.capabilities.find(capability => capability.slug === item.entity)?.definition)
            const singleView = onViewChange && views.length === 1 ? views[0] : undefined
            const grouped = Boolean(onViewChange && views.length > 1)
            const expanded = expandedSections[item.entity] ?? activeEntity === item.entity
            const viewsId = `navigation-views-${item.entity}`
            return <div key={item.entity} className="desk-nav-section" data-current={activeEntity === item.entity} data-nav-kind={grouped ? 'group' : 'direct'}>
              <div className="desk-nav-section-heading"><Button variant="ghost" className="nav-item" aria-current={!reviewing && activeEntity === item.entity && (!activeView || singleView?.id === activeView) ? 'page' : undefined} onPress={() => navigateApplication(() => {
                if (singleView) onViewChange?.(singleView.id)
                else onEntityChange(item.entity)
                if (grouped) setExpandedSections(current => ({ ...current, [item.entity]: true }))
              })}><EntityIcon data-icon="inline-start" aria-hidden="true" /><span title={singleView ? `${item.label} · ${singleView.name}` : item.label}>{item.label}</span></Button>
              {grouped ? <Button variant="ghost" size="icon" className="desk-section-toggle" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.label} views`} aria-expanded={expanded} aria-controls={viewsId} onPress={() => setExpandedSections(current => ({ ...current, [item.entity]: !expanded }))}><ChevronRight /></Button> : null}</div>
              {grouped ? <div id={viewsId} hidden={!expanded} className="desk-view-list" role="group" aria-label={`${item.label} views`}>{views.map(view => {
                return <Button key={view.id} variant="ghost" className="nav-item desk-saved-view" aria-current={!reviewing && activeView === view.id ? 'page' : undefined} onPress={() => navigateApplication(() => onViewChange?.(view.id))}><span title={view.name}>{view.name}</span></Button>
              })}</div> : null}
            </div>
          }) : <Link to="/p/$projectSlug" params={{ projectSlug: slug }} activeOptions={{ exact: true }} className="nav-item" aria-current={!configure && !pathname.endsWith('/members') ? 'page' : undefined}><PrimaryEntityIcon aria-hidden="true" /><span>{snapshot.project?.shell === 'site' ? 'Content' : snapshot.capability.definition.entity.label.endsWith('s') ? snapshot.capability.definition.entity.label : `${snapshot.capability.definition.entity.label}s`}</span></Link>}
          {onReview ? <Button variant="ghost" className="nav-item" aria-current={reviewing ? 'page' : undefined} onPress={() => navigateApplication(onReview)}><ClipboardCheck data-icon="inline-start" aria-hidden="true" /><span>{reviewLabel}</span></Button> : null}
          {liveHref ? <a className="nav-item" href={liveHref}><SquareArrowOutUpRight />View live</a> : null}
        </nav>
        </>}
          {owner && !settingsNavigation ? <details className="account-navigation" open>
            <summary><Settings aria-hidden="true" /><span>Manage account</span><ChevronRight aria-hidden="true" /></summary>
            <div className="account-navigation-links">
              {workspace ? <Link to="/members" className="nav-item" aria-current={workspacePage === 'members' ? 'page' : undefined} onClick={() => setNavOpen(false)}><Users /><span>Members</span></Link> : <Link to="/p/$projectSlug/members" params={{ projectSlug: slug }} className="nav-item" aria-current={pathname.endsWith('/members') ? 'page' : undefined} onClick={() => setNavOpen(false)}><Users /><span>Members</span></Link>}
              {workspace ? <Link to="/settings" className="nav-item" aria-current={workspacePage === 'settings' ? 'page' : undefined} onClick={() => setNavOpen(false)}><Settings2 /><span>Settings</span></Link> : <Link to="/p/$projectSlug/build" params={{ projectSlug: slug }} className="nav-item" aria-current={configure ? 'page' : undefined} onClick={() => setNavOpen(false)}><Settings2 /><span>Configure application</span></Link>}
            </div>
          </details> : null}
        </div>
        <div className="desk-nav-bottom">
          <Button variant="ghost" className="desk-collapse-toggle" aria-label={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!navCollapsed} aria-controls="desk-navigation-directory" onPress={() => setNavCollapsed(value => !value)}>{navCollapsed ? <PanelLeftOpen data-icon="inline-start" /> : <PanelLeftClose data-icon="inline-start" />}<span>{navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span></Button>
        </div>
      </aside>
      <FrameBreadcrumbContext.Provider value={setBreadcrumbs}><AssignmentMembers.Provider value={snapshot.members ?? []}>{children}</AssignmentMembers.Provider></FrameBreadcrumbContext.Provider>
      <footer className="desk-footer"><Link to="/docs">Documentation</Link><Link to="/">Built with <strong>Kernel</strong></Link></footer>
    </div>
  )
}
