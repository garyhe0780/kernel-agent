import React from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { CatalogWorkbench } from '../../src/components/workspace-catalog'
import { ProjectFrame } from '../../src/components/project-frame'
import type { Snapshot } from '../../src/lib/client'
import '../../src/styles.css'

// Real catalog and shell, synthetic workspace identity. No database or mutation transport.
window.fetch = async () => Response.json({ error: 'This preview has no server transport.' }, { status: 403 })
const snapshot = { workspace: { id: 'catalog-preview', name: 'Preview workspace' }, principal: { role: 'owner', userId: 'catalog-preview', name: 'Preview owner' }, projects: [], capabilities: [], records: [], changes: [], executions: [], tools: [], catalog: [] } as unknown as Snapshot
function Fixture() {
  const owner = !new URLSearchParams(window.location.search).has('operator')
  return <ProjectFrame snapshot={snapshot} workspace workspacePage="catalog"><CatalogWorkbench owner={owner} /></ProjectFrame>
}
const rootRoute = createRootRoute({ component: Fixture })
const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/catalog'] }) })
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
