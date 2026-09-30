import React from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { procurement } from '../../src/kernel/procurement'
import { evaluate } from '../../src/kernel/definition'
import type { Proposal, Snapshot } from '../../src/lib/client'
import '../../src/styles.css'

// Synthetic in-memory review flow: no API requests or database writes leave this fixture.
const params = new URLSearchParams(location.search)
const definition = structuredClone(procurement)
const capability = { slug: definition.slug, version: 1, definition }
const project = { slug: 'action-review-preview', name: 'Purchasing demo', description: 'Synthetic review fixture', shell: 'workbench' as const, pattern: null, version: 1, editable: false, demo: true, packages: [definition.slug] }
const snapshot: Snapshot = {
  workspace: { id: 'review-preview', name: 'Example workspace' },
  principal: { workspaceId: 'review-preview', kind: 'human', role: 'owner', userId: 'preview-user', name: 'Alex Chen' },
  project, projects: [project], capability, capabilities: [capability], model: { configured: false },
  members: [{ id: 'preview-user', name: 'Alex Chen' }],
  records: params.has('empty') ? [] : [
    { id: 'example-request-001', capability: definition.slug, entity: definition.entity.name, version: 1, createdAt: '2026-09-30T08:00:00Z', updatedAt: '2026-09-30T08:00:00Z', data: { title: 'Design team laptops', supplier: 'Northstar Equipment', amountCents: 240000, category: 'Equipment', justification: 'Replace aging laptops for the design team.', supplierVerified: true, status: 'submitted', decisionNote: '' } },
    { id: 'example-request-002', capability: definition.slug, entity: definition.entity.name, version: 1, createdAt: '2026-09-30T08:00:00Z', updatedAt: '2026-09-30T08:00:00Z', data: { title: 'Annual software renewal', supplier: 'Unverified supplier', amountCents: 1200000, category: 'Software', justification: 'Annual software renewal for the operations team.', supplierVerified: false, status: 'submitted', decisionNote: '' } },
  ],
  changes: [], executions: [], tools: [], catalog: [],
}
const keys = new Map<string, Proposal>()
let sequence = 0
let failNext = params.has('failure')
window.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input)
  if (url.includes('/api/auth/get-session')) return Response.json({ user: { id: 'preview-user', name: 'Alex Chen', email: 'alex@example.test', emailVerified: true }, session: { id: 'preview-session', userId: 'preview-user', expiresAt: '2099-01-01T00:00:00Z' } })
  if (url.includes('/api/kernel?project=')) return Response.json(snapshot)
  if (url.includes('/api/kernel?agents=')) return Response.json([])
  if (url.includes('/api/kernel?workspaces')) return Response.json([{ id: snapshot.workspace.id, name: snapshot.workspace.name, role: 'owner' }])
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  if (url.includes('/api/agent') && body?.type === 'stage') {
    if (failNext) { failNext = false; return Response.json({ error: 'Synthetic connection failure. Try staging again.' }, { status: 503 }) }
    const record = snapshot.records.find(item => item.id === body.recordId)!
    const preview = evaluate(definition, body.action, record.data, body.input, 'owner')
    if (!preview.allowed) return Response.json({ status: 'blocked', checks: preview.checks })
    const prior = keys.get(body.idempotencyKey)
    if (prior) return Response.json({ status: 'staged', change: prior })
    const change: Proposal = { id: `example-proposal-${++sequence}`, capability: capability.slug, recordId: record.id, recordVersion: record.version, definitionVersion: capability.version, before: { ...record.data }, after: preview.after, input: preview.input, action: body.action, checks: preview.checks, status: 'pending', actorKind: 'agent', proposerName: 'Alex Chen (simulator)', createdAt: new Date().toISOString() }
    snapshot.changes.unshift(change); keys.set(body.idempotencyKey, change)
    return Response.json({ status: 'staged', change })
  }
  if (url.includes('/api/kernel') && body?.type === 'review') {
    const change = snapshot.changes.find(item => item.id === body.changeId)!
    const record = snapshot.records.find(item => item.id === change.recordId)!
    if (body.decision === 'apply') { record.data = { ...change.after }; record.version += 1; change.status = 'applied' } else change.status = 'rejected'
    snapshot.executions.unshift({ id: `example-execution-${sequence}`, action: `${capability.slug}.${change.action}`, outcome: change.status, actorName: 'Alex Chen', actorKind: 'human', details: {}, createdAt: new Date().toISOString(), recordId: record.id })
    return Response.json({ status: change.status })
  }
  return Response.json({ error: 'Synthetic preview: this action is not connected.' }, { status: 403 })
}
const { ProjectBuild } = await import('../../src/components/project-build')
const rootRoute = createRootRoute({ component: () => <><ProjectBuild projectSlug={project.slug} /><p style={{ margin: 0, padding: '8px 16px', fontSize: 11 }}>Synthetic preview · No live data is changed</p></> })
const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/p/action-review-preview/build'] }) })
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
