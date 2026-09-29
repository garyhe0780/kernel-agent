import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { openTestDatabase } from './test-database'
import { Kernel } from '../src/kernel/engine.server'
import { AccessManagement } from '../src/kernel/access-management.server'
import { AgentAccess } from '../src/kernel/agent-access.server'
import type { Principal } from '../src/kernel/definition'

const { db, close } = await openTestDatabase()
after(close)
const kernel = new Kernel(db)
const access = new AccessManagement(db)
let sequence = 0
async function fixture() {
  const suffix = ++sequence
  const owner = await db.user.create({
    data: {
      id: `owner-${suffix}`,
      name: 'Owner',
      email: `owner-${suffix}@test.invalid`,
    },
  })
  const member = await kernel.ensureWorkspace(owner, true)
  const p: Principal = {
    userId: owner.id,
    name: owner.name,
    workspaceId: member.workspaceId,
    role: 'owner',
    kind: 'human',
  }
  const colleague = await db.user.create({
    data: {
      id: `colleague-${suffix}`,
      name: 'Colleague',
      email: `colleague-${suffix}@test.invalid`,
    },
  })
  await db.membership.create({
    data: {
      workspaceId: member.workspaceId,
      userId: colleague.id,
      role: 'application',
    },
  })
  const user: Principal = {
    ...p,
    userId: colleague.id,
    name: colleague.name,
    role: 'application',
  }
  const projects = (await kernel.snapshot(p)).projects
  return { p, user, projects }
}
async function createGroup(p: Principal, project?: string) {
  return access.mutate(p, {
    type: 'create_access_group',
    name: 'Engineering',
    description: '',
    ...(project ? { project } : {}),
  })
}

test('workspace groups grant and revoke effective roles without replacing direct membership', async () => {
  const { p, user } = await fixture()
  const { id } = await createGroup(p)
  await access.mutate(p, {
    type: 'set_access_group_members',
    id,
    expectedVersion: 1,
    userIds: [user.userId],
  })
  await access.mutate(p, {
    type: 'create_access_policy',
    id,
    expectedVersion: 2,
    role: 'owner',
  })
  const resolved = await kernel.workspaceMembership(
    { id: user.userId, name: user.name },
    p.workspaceId
  )
  assert.equal(resolved.role, 'owner')
  assert.equal(
    (await db.membership.findFirstOrThrow({ where: { userId: user.userId } }))
      .role,
    'application'
  )
  const elevated = { ...user, role: resolved.role }
  assert.equal((await kernel.snapshot(elevated)).principal.role, 'owner')
  const agents = new AgentAccess(db)
  const grant = await agents.create(elevated, {
    kind: 'construct',
    name: 'Group builder',
    expiresInDays: 1,
  })
  const state = await access.list(p)
  const policy = state.groups[0].policies[0]
  await assert.rejects(
    access.mutate(elevated, {
      type: 'delete_access_policy',
      id,
      expectedVersion: 3,
      policyId: policy.id,
    }),
    /another owner/
  )
  await access.mutate(p, {
    type: 'delete_access_policy',
    id,
    expectedVersion: 3,
    policyId: policy.id,
  })
  assert.equal(
    (
      await kernel.workspaceMembership(
        { id: user.userId, name: user.name },
        p.workspaceId
      )
    ).role,
    'application'
  )
  await assert.rejects(kernel.snapshot(elevated), /access/)
  assert.equal(
    (await agents.listWorkspace(p)).find(
      (item) => item.id === grant.credential.id
    )?.state,
    'Needs review'
  )
})

test('application group policy scopes reads and revocation immediately removes group access', async () => {
  const { p, user, projects } = await fixture()
  const project = projects[0]
  const { id } = await createGroup(p, project.slug)
  await access.mutate(p, {
    type: 'set_access_group_members',
    project: project.slug,
    id,
    expectedVersion: 1,
    userIds: [user.userId],
  })
  await access.mutate(p, {
    type: 'create_access_policy',
    project: project.slug,
    id,
    expectedVersion: 2,
    target: project.slug,
    role: 'operator',
  })
  const visible = await kernel.snapshot(user, project.slug)
  assert.deepEqual(
    visible.projects.map((item) => item.slug),
    [project.slug]
  )
  assert.ok(visible.members.some((item) => item.id === user.userId))
  assert.ok(
    (await access.list(p, project.slug)).members.some(
      (item) => item.user.id === user.userId
    )
  )
  if (projects[1])
    await assert.rejects(
      kernel.snapshot(user, projects[1].slug),
      /not found|access/i
    )
  await access.mutate(p, {
    type: 'delete_access_group',
    project: project.slug,
    id,
    expectedVersion: 3,
  })
  assert.equal((await kernel.snapshot(user)).projects.length, 0)
})

test('group mutations reject foreign members, cross-account policies, operators and stale versions', async () => {
  const { p, user, projects } = await fixture()
  const other = await fixture()
  const project = projects[0]
  const { id } = await createGroup(p, project.slug)
  const base = { project: project.slug, id, expectedVersion: 1 }
  await assert.rejects(
    access.mutate(user, {
      type: 'create_access_group',
      name: 'Invalid',
      description: '',
    }),
    /Only workspace owners/
  )
  await assert.rejects(
    access.mutate(p, {
      type: 'set_access_group_members',
      ...base,
      userIds: [other.user.userId],
    }),
    /existing members/
  )
  await assert.rejects(
    access.mutate(p, { type: 'create_access_policy', ...base, role: 'owner' }),
    /own application/
  )
  if (projects[1])
    await assert.rejects(
      access.mutate(p, {
        type: 'create_access_policy',
        ...base,
        role: 'operator',
        target: projects[1].slug,
      }),
      /own application/
    )
  await assert.rejects(
    access.mutate(p, {
      type: 'create_access_policy',
      ...base,
      role: 'owner',
      target: project.slug,
    }),
    /Operator role/
  )
  await assert.rejects(
    access.mutate(other.p, { type: 'delete_access_group', ...base }),
    /not found/
  )
  await access.mutate(p, {
    type: 'update_access_group',
    ...base,
    name: 'Renamed',
    description: '',
  })
  await assert.rejects(
    access.mutate(p, { type: 'delete_access_group', ...base }),
    /Refresh/
  )
})

test('removing workspace membership cascades group membership and direct application access survives group deletion', async () => {
  const { p, user, projects } = await fixture()
  const project = await db.project.findUniqueOrThrow({
    where: {
      workspaceId_slug: { workspaceId: p.workspaceId, slug: projects[0].slug },
    },
  })
  await db.projectMember.create({
    data: { projectId: project.id, userId: user.userId },
  })
  const { id } = await createGroup(p)
  await access.mutate(p, {
    type: 'set_access_group_members',
    id,
    expectedVersion: 1,
    userIds: [user.userId],
  })
  await access.mutate(p, {
    type: 'create_access_policy',
    id,
    expectedVersion: 2,
    target: project.slug,
    role: 'operator',
  })
  await access.mutate(p, {
    type: 'delete_access_group',
    id,
    expectedVersion: 3,
  })
  assert.equal((await kernel.snapshot(user)).projects.length, 1)
  const next = await createGroup(p)
  await access.mutate(p, {
    type: 'set_access_group_members',
    id: next.id,
    expectedVersion: 1,
    userIds: [user.userId],
  })
  await kernel.updateMember(p, user.userId, 'application', 'remove')
  assert.equal((await access.list(p)).groups[0].userIds.length, 0)
  await assert.rejects(kernel.snapshot(user), /access/)
})

test('revoking a group application policy blocks previously staged proposals', async () => {
  const { p, user } = await fixture()
  const { id } = await createGroup(p)
  await access.mutate(p, {
    type: 'set_access_group_members',
    id,
    expectedVersion: 1,
    userIds: [user.userId],
  })
  await access.mutate(p, {
    type: 'create_access_policy',
    id,
    expectedVersion: 2,
    target: 'procurement',
    role: 'operator',
  })
  const snapshot = await kernel.snapshot(user, 'procurement')
  const record = snapshot.records.find(
    (item) =>
      (item.data as { title: string }).title === 'Design team software licenses'
  )!
  const staged = await kernel.stage(user, {
    recordId: record.id,
    action: 'approve',
    input: {},
    idempotencyKey: 'group-revoked-proposal',
  })
  assert.ok(staged.change)
  const policy = (await access.list(p)).groups[0].policies[0]
  await access.mutate(p, {
    type: 'delete_access_policy',
    id,
    expectedVersion: 3,
    policyId: policy.id,
  })
  await assert.rejects(
    kernel.review(p, staged.change.id, 'apply'),
    /outside your application/
  )
  assert.equal(
    (await db.changeSet.findUniqueOrThrow({ where: { id: staged.change.id } }))
      .status,
    'pending'
  )
})
