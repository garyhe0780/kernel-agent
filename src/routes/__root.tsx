import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import stylesheet from '@/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Kernel — Business workspace' }, { name: 'description', content: 'Configure your business. Review agent proposals. Keep every decision accountable.' }],
    links: [{ rel: 'stylesheet', href: stylesheet }, { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  }),
  component: () => <html lang="en"><head><HeadContent /></head><body><Outlet /><Scripts /></body></html>,
  notFoundComponent: () => <main className="auth-page"><h1>Page not found</h1><a href="/workspace">Return to your workspace</a></main>,
  errorComponent: ({ error }) => <main className="auth-page"><h1>Workspace unavailable</h1><p>{error instanceof Error ? error.message : 'The workspace could not be opened.'}</p><a href="/">Try again</a></main>,
})
