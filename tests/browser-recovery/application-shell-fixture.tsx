import React from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { compileAssembly, assemblePattern } from '../../src/kernel/application'
import { applicationPresentation } from '../../src/kernel/application-views'
import { validateFields, type RecordData } from '../../src/kernel/definition'
import type { Snapshot } from '../../src/lib/client'
import '../../src/styles.css'

// Real application shell and workbench; synthetic identity/data, no database writes.
const params = new URLSearchParams(location.search)
const pattern = params.get('pattern') ?? 'crm_sales'
const application = compileAssembly(assemblePattern(pattern))
if (pattern === 'crm_sales') application.startView = 'tasks'
if (params.has('no-views')) { application.views = []; application.startView = null }
const project = {
  slug: 'shell-preview', name: pattern === 'crm_sales' ? 'Sales CRM' : `Demo · ${application.name}`, description: 'Synthetic application preview. No live data is changed.',
  shell: 'workbench' as const, pattern: null, version: 1, editable: true, demo: true,
  packages: application.entities.map(entity => entity.slug), presentation: applicationPresentation(application),
}
const capabilities = application.entities.map(definition => ({ slug: definition.slug, version: 1, definition }))
const snapshot: Snapshot = {
  workspace: { id: 'shell-preview', name: 'Example workspace' },
  principal: { workspaceId: 'shell-preview', kind: 'human', role: 'owner', userId: 'preview-user', name: 'Alex Chen' },
  project, projects: [project], capability: capabilities[0], capabilities,
  model: { configured: false }, members: [{ id: 'preview-user', name: 'Alex Chen' }],
  records: pattern === 'crm_sales' && params.has('populated') ? [{ id: 'example-task', capability: 'tasks', entity: 'tasks', version: 1,
    createdAt: '2026-09-29T08:00:00Z', updatedAt: '2026-09-29T08:00:00Z',
    data: { title: 'Prepare the customer proposal', status: 'open', dueDate: '2026-09-30', assignee: 'preview-user' },
  }] : [],
  changes: [], executions: [], tools: [], catalog: [],
}
if (params.has('audit') && pattern === 'crm_sales') {
  const example = (id: string, capability: string, data: RecordData) => {
    const definition = capabilities.find(item => item.slug === capability)!.definition
    const { status, ...fields } = data
    const valid = validateFields(definition.entity.fields, fields, true)
    return { id, capability, entity: definition.entity.name, version: 1, createdAt: '2026-09-28T08:00:00Z', updatedAt: '2026-09-28T08:00:00Z', data: { ...valid, ...(status ? { status } : {}) } }
  }
  snapshot.records = [
    example('account-1', 'customers', { title: 'Northstar Operations', industry: 'Technology', contact: 'Jordan Lee', website: 'https://example.test', notes: 'Synthetic account with linked work.' }),
    example('contact-1', 'contacts', { title: 'Jordan Lee', email: 'jordan@example.test', account: 'account-1', role: 'Operations director' }),
    example('deal-1', 'opportunities', { title: 'Annual subscription', customer: 'account-1', contactPerson: 'contact-1', amountCents: 250000, assignee: 'preview-user', nextStep: 'Review the proposal with Jordan', followUpDate: '2026-10-07', closeDate: '2026-11-01', notes: 'Synthetic deal. This preview never writes to the application database.' }),
    example('deal-2', 'opportunities', { title: 'Expansion for the international operations team', customer: 'account-1', amountCents: 98765432100, nextStep: '', followUpDate: '2026-09-30', status: 'qualified', probability: 20 }),
    example('example-task', 'tasks', { title: 'Prepare the customer proposal', deal: 'deal-1', account: 'account-1', assignee: 'preview-user', dueDate: '2026-10-07' }),
    example('activity-1', 'activities', { title: 'Discovery call with Jordan', deal: 'deal-1', account: 'account-1', contact: 'contact-1', occurredOn: '2026-10-06', notes: 'Confirmed the next review meeting.' }),
  ]
  snapshot.executions = [{ id: 'example-event', action: 'opportunities.edit', outcome: 'applied', actorName: 'Alex Chen', actorKind: 'human', details: {}, recordId: 'deal-1', createdAt: '2026-10-06T08:00:00Z' }]
}
let failSnapshot = params.has('load-failure')
window.fetch = async input => {
  const url = input instanceof Request ? input.url : String(input)
  if (url.includes('/api/auth/get-session')) return Response.json({ user: { id: 'preview-user', name: 'Alex Chen', email: 'alex@example.test', emailVerified: true }, session: { id: 'preview-session', userId: 'preview-user', expiresAt: '2099-01-01T00:00:00Z' } })
  if (url.includes('/api/kernel?project=')) {
    if (failSnapshot) { failSnapshot = false; return Response.json({ error: 'Synthetic connection failure. Try again.' }, { status: 503 }) }
    return Response.json(snapshot)
  }
  if (url.includes('/api/kernel?history=')) return Response.json([{ version: 1, createdAt: '2026-09-28T08:00:00Z', migration: {} }])
  if (url.includes('/api/kernel?agents=') || url.includes('/api/kernel?operationRuns=')) return Response.json([])
  if (url.includes('/api/kernel?operationHealth=')) return Response.json({ status: 'healthy', lastSuccessAt: '2026-10-07T00:00:00Z', stalled: 0 })
  if (url.includes('/api/kernel?members=')) {
    const member = { user: { id: 'preview-user', name: 'Alex Chen', email: 'alex@example.test' }, role: 'owner', directRole: 'owner', direct: true, groups: [] }
    return Response.json({ members: [member], availableMembers: [member], groups: [], projectId: project.slug, projects: [{ ...project, id: project.slug }], invitations: [] })
  }
  return Response.json({ error: 'Synthetic preview: this action does not contact the live server.' }, { status: 403 })
}
const { WorkbenchApp } = await import('../../src/components/workbench-app')
const { ProjectBuild } = await import('../../src/components/project-build')
const { ApplicationMembers } = await import('../../src/components/application-members')
const rootRoute = createRootRoute({ component: () => <>{params.get('screen') === 'configure' ? <ProjectBuild projectSlug={project.slug} /> : params.get('screen') === 'members' ? <ApplicationMembers projectSlug={project.slug} /> : <WorkbenchApp projectSlug={project.slug} />}<p className="shell-preview-disclosure">Synthetic preview · No live data</p></> })
const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/p/shell-preview'] }) })
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
