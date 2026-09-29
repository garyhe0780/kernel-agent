import React from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { compileAssembly, assemblePattern } from '../../src/kernel/application'
import { applicationPresentation } from '../../src/kernel/application-views'
import type { Snapshot } from '../../src/lib/client'
import '../../src/styles.css'

// Real application shell and workbench; synthetic identity/data, no database writes.
const application = compileAssembly(assemblePattern('crm_sales'))
application.startView = 'tasks'
const params = new URLSearchParams(location.search)
const project = {
  slug: 'shell-preview', name: 'Sales CRM', description: 'Synthetic application preview. No live data is changed.',
  shell: 'workbench' as const, pattern: null, version: 1, editable: true, demo: true,
  packages: application.entities.map(entity => entity.slug), presentation: applicationPresentation(application),
}
const capabilities = application.entities.map(definition => ({ slug: definition.slug, version: 1, definition }))
const snapshot: Snapshot = {
  workspace: { id: 'shell-preview', name: 'Example workspace' },
  principal: { workspaceId: 'shell-preview', kind: 'human', role: 'owner', userId: 'preview-user', name: 'Alex Chen' },
  project, projects: [project], capability: capabilities[0], capabilities,
  model: { configured: false }, members: [{ id: 'preview-user', name: 'Alex Chen' }],
  records: params.has('populated') ? [{ id: 'example-task', capability: 'tasks', entity: 'tasks', version: 1,
    createdAt: '2026-09-29T08:00:00Z', updatedAt: '2026-09-29T08:00:00Z',
    data: { title: 'Prepare the customer proposal', status: 'open', dueDate: '2026-09-30', assignee: 'preview-user' },
  }] : [],
  changes: [], executions: [], tools: [], catalog: [],
}
window.fetch = async input => {
  const url = input instanceof Request ? input.url : String(input)
  if (url.includes('/api/auth/get-session')) return Response.json({ user: { id: 'preview-user', name: 'Alex Chen', email: 'alex@example.test', emailVerified: true }, session: { id: 'preview-session', userId: 'preview-user', expiresAt: '2099-01-01T00:00:00Z' } })
  if (url.includes('/api/kernel?project=')) return Response.json(snapshot)
  return Response.json({ error: 'Synthetic preview: this action does not contact the live server.' }, { status: 403 })
}
const { WorkbenchApp } = await import('../../src/components/workbench-app')
const rootRoute = createRootRoute({ component: () => <><WorkbenchApp projectSlug={project.slug} /><p className="shell-preview-disclosure">Synthetic preview · No live data</p></> })
const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/p/shell-preview'] }) })
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
