import React from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { assemblePattern, compileAssembly } from '../../src/kernel/application'
import type { Snapshot } from '../../src/lib/client'
import '../../src/styles.css'

// Synthetic in-memory agent setup: no API requests or database writes leave this fixture.
const params = new URLSearchParams(location.search)
const application = compileAssembly(assemblePattern('crm_sales'))
const definitions = application.entities
const definition = definitions[0]
const capability = { slug: definition.slug, version: 1, definition }
const capabilities = definitions.map(definition => ({slug: definition.slug, version: 1, definition}))
const project = { slug: 'action-review-preview', name: 'Sales CRM', description: 'Synthetic review fixture', shell: 'workbench' as const, pattern: null, version: 1, editable: true, demo: true, packages: [definition.slug] }
const snapshot: Snapshot = {
  workspace: { id: 'review-preview', name: 'Example workspace' },
  principal: { workspaceId: 'review-preview', kind: 'human', role: 'owner', userId: 'preview-user', name: 'Alex Chen' },
  project, projects: [project], capability, capabilities, model: { configured: false },
  members: [{ id: 'preview-user', name: 'Alex Chen' }],
  records: [],
  changes: [], executions: [], tools: [], catalog: [],
}
let sequence = 0
let failNext = params.has('failure')
const credentials: {id:string;name:string;prefix:string;expiresAt:string;revokedAt:string|null;actions:unknown[]}[] = []
if(params.has('populated')) credentials.push({id:'example-credential',name:'Sales assistant',prefix:'krn_preview',expiresAt:'2026-10-30T08:00:00Z',revokedAt:null,actions:[{capability:capability.slug,action:definition.actions[0].name,version:1,execution:'review'}]})
window.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input)
  if (url.includes('/api/auth/get-session')) return Response.json({ user: { id: 'preview-user', name: 'Alex Chen', email: 'alex@example.test', emailVerified: true }, session: { id: 'preview-session', userId: 'preview-user', expiresAt: '2099-01-01T00:00:00Z' } })
  if (url.includes('/api/kernel?project=')) return Response.json(snapshot)
  if (url.includes('/api/kernel?agents=')) return Response.json(credentials)
  if (url.includes('/api/kernel?workspaces')) return Response.json([{ id: snapshot.workspace.id, name: snapshot.workspace.name, role: 'owner' }])
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  if (body?.type === 'create_agent_credential') {
    if (failNext) { failNext = false; return Response.json({error:'Synthetic connection failure. Try creating again.'},{status:503}) }
    const credential = {id:`example-${++sequence}`, name:body.name,prefix:'krn_preview',expiresAt:new Date(Date.now()+body.expiresInDays*86400000).toISOString(),revokedAt:null,actions:body.actions}
    credentials.unshift(credential)
    return Response.json({token:'krn_preview_synthetic_not_a_real_credential',credential})
  }
  if (body?.type === 'revoke_agent_credential') { const credential = credentials.find(item=>item.id===body.id)!; credential.revokedAt=new Date().toISOString(); return Response.json({status:'revoked'}) }
  if(url.includes('/api/agent')) return Response.json({project:{name:'Sales CRM'},capabilities:capabilities.map(cap=>({tools:cap.definition.actions}))})
  return Response.json({ error: 'Synthetic preview: this action is not connected.' }, { status: 403 })
}
const { ProjectBuild } = await import('../../src/components/project-build')
const rootRoute = createRootRoute({ component: () => <><ProjectBuild projectSlug={project.slug} /><p style={{ margin: 0, padding: '8px 16px', fontSize: 11 }}>Synthetic preview · No live data is changed</p></> })
const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/p/action-review-preview/build'] }) })
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
