import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'
import { AccountMembers } from '../../src/components/account-members'
import { ProjectFrame } from '../../src/components/project-frame'
import type { Snapshot } from '../../src/lib/client'
import '../../src/styles.css'

// Isolated UI fixture: every identity is synthetic and all writes stay in memory.
const params = new URLSearchParams(location.search)
const application = params.has('application')
let failNextInvite = params.has('inviteFailure')
const invitations: {id:string;email:string;role?:string;expiresAt:string}[] = []
const workspace = { id: 'preview', name: 'Example workspace' }
const project = {
  id: 'crm',
  slug: 'crm',
  name: 'Sales CRM',
  shell: 'workbench',
  packages: [],
  presentation: { navigation: [], views: [] },
}
const snapshot = {
  workspace,
  principal: { role: 'owner', userId: 'alex', name: 'Alex Chen' },
  project,
  projects: [project],
  capability: { definition: { entity: { label: 'Contact' } } },
  capabilities: [],
  records: [],
  changes: [],
  executions: [],
  tools: [],
  catalog: [],
} as unknown as Snapshot
const members = [
  {
    user: { id: 'alex', name: 'Alex Chen', email: 'alex@example.test' },
    role: 'owner',
    directRole: 'owner',
    direct: false,
    groups: [],
  },
  {
    user: { id: 'sam', name: 'Sam Rivera', email: 'sam@example.test' },
    role: 'operator',
    directRole: 'operator',
    direct: false,
    groups: [
      {
        id: 'engineering',
        name: 'Engineering',
        projectId: application ? 'crm' : null,
      },
    ],
  },
  {
    user: { id: 'jordan', name: 'Jordan Lee', email: 'jordan@example.test' },
    role: 'application',
    directRole: 'application',
    direct: true,
    groups: [],
  },
]
let groups = [
  {
    id: 'engineering',
    name: 'Engineering',
    description: 'People who build and maintain our applications.',
    version: 1,
    userIds: ['sam'],
    policies: [
      {
        id: 'policy-1',
        role: 'operator',
        projectId: 'crm' as string | null,
        project: { slug: 'crm', name: 'Sales CRM' } as {
          slug: string
          name: string
        } | null,
      },
    ],
  },
]
window.fetch = async (input, init) => {
  const url = String(input)
  if (url.includes('workspaces'))
    return Response.json([{ workspace, role: 'owner' }])
  if (!init?.method || init.method === 'GET')
    return Response.json({
      members,
      availableMembers: members,
      groups,
      projectId: application ? 'crm' : null,
      projects: [project],
      invitations,
    })
  const command = JSON.parse(String(init.body))
  if (command.type === 'invite_member' || command.type === 'invite_application_user') {
    if (failNextInvite) { failNextInvite = false; return Response.json({error:'Synthetic invitation failure. Try again.'}, {status:503}) }
    invitations.push({id:`invite-${invitations.length}`,email:command.email,role:command.role,expiresAt:'2026-10-08T00:00:00Z'})
    return Response.json({token:'synthetic-preview-token'})
  }
  const group = groups.find((item) => item.id === command.id)
  if (command.type === 'create_access_group') {
    const id = `group-${groups.length}`
    groups.push({
      id,
      name: command.name,
      description: command.description,
      version: 1,
      userIds: [],
      policies: [],
    })
    return Response.json({ id })
  }
  if (group) {
    group.version++
    if (command.type === 'set_access_group_members')
      group.userIds = command.userIds
    if (command.type === 'create_access_policy')
      group.policies.push({
        id: `policy-${group.version}`,
        role: command.role,
        projectId: command.target ? 'crm' : null,
        project: command.target ? { slug: 'crm', name: 'Sales CRM' } : null,
      })
    if (command.type === 'delete_access_policy')
      group.policies = group.policies.filter(
        (policy) => policy.id !== command.policyId
      )
    if (command.type === 'update_access_group') {
      group.name = command.name
      group.description = command.description
    }
    if (command.type === 'delete_access_group')
      groups = groups.filter((item) => item.id !== group.id)
  }
  return Response.json({ id: group?.id, token: 'synthetic-preview-token' })
}
function Fixture() {
  return (
    <ProjectFrame
      snapshot={snapshot}
      workspace={!application}
      workspacePage="members"
      headerLocation="Manage account / Members"
    >
      <main className="main members-page" id="main-content">
        <AccountMembers
          project={application ? 'crm' : undefined}
          accountName={application ? project.name : workspace.name}
          userId="alex"
        />
        <p className="members-help" style={{ padding: '16px 40px', marginTop: 'auto' }}>
          Synthetic preview · Changes stay in this page.
        </p>
      </main>
    </ProjectFrame>
  )
}
const rootRoute = createRootRoute({ component: Fixture })
const router = createRouter({
  routeTree: rootRoute,
  history: createMemoryHistory({
    initialEntries: [application ? '/p/crm/members' : '/members'],
  }),
})
createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />
)
