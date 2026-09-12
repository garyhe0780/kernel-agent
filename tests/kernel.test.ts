import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { Kernel, KernelError } from '../src/kernel/engine.server'
import { evaluate, procurement, validateFields, type Principal, type RecordData } from '../src/kernel/definition'
import { composePublic, composeEditorial } from '../src/kernel/packages'

const folder = mkdtempSync(join(tmpdir(), 'kernel-tests-'))
const db = new PrismaClient({ datasourceUrl: `file:${join(folder, 'test.db')}` })
const kernel = new Kernel(db)
let sequence = 0

before(async () => {
  const migrations = [
    new URL('../prisma/migrations/202609100001_initial/migration.sql', import.meta.url),
    new URL('../prisma/migrations/202609110001_projects/migration.sql', import.meta.url),
  ]
  for (const file of migrations) {
    const migration = readFileSync(file, 'utf8')
    for (const statement of migration.split(';').filter(s => s.trim())) await db.$executeRawUnsafe(statement)
  }
})
after(async () => { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }) })

async function fixture() {
  const id = `user-${++sequence}`
  await db.user.create({ data: { id, name: 'Test Operator', email: `${id}@example.test` } })
  const member = await kernel.ensureWorkspace({ id, name: 'Test Operator' })
  const human: Principal = { userId: id, name: 'Test Operator', workspaceId: member.workspaceId, role: member.role, kind: 'human' }
  const agent: Principal = { ...human, kind: 'agent' }
  const snapshot = await kernel.snapshot(human)
  const record = snapshot.records.find(r => (r.data as RecordData).title === 'Design team software licenses')!
  return { human, agent, record, snapshot }
}

test('agent stages a proposal; only human review applies it with a single audit event', async () => {
  const { human, agent, record } = await fixture()
  const staged = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'approve-once' })
  assert.equal(staged.status, 'staged')
  assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: record.id } })).version, 1)
  await assert.rejects(kernel.review(agent, staged.change!.id, 'apply'), (error: unknown) => error instanceof KernelError && error.code === 'HUMAN_APPROVAL_REQUIRED')
  await kernel.review(human, staged.change!.id, 'apply')
  const repeated = await kernel.review(human, staged.change!.id, 'apply')
  assert.equal(repeated.repeated, true)
  const updated = await db.businessRecord.findUniqueOrThrow({ where: { id: record.id } })
  assert.equal((updated.data as RecordData).status, 'approved')
  assert.equal(updated.version, 2)
  assert.equal(await db.execution.count({ where: { changeId: staged.change!.id, outcome: 'applied' } }), 1)
})

test('spending and supplier policies block writes and record the failed checks', async () => {
  const { human, agent, snapshot } = await fixture()
  for (const title of ['Customer research study', 'Security assessment']) {
    const record = snapshot.records.find(r => (r.data as RecordData).title === title)!
    const result = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: record.id })
    assert.equal(result.status, 'blocked')
    assert.equal(result.change, null)
  }
  const result = await kernel.snapshot(human)
  assert.equal(result.changes.length, 0)
  assert.equal(result.executions.filter(e => e.outcome === 'blocked').length, 2)
})

test('human and agent use the same policy evaluation', async () => {
  const { human, agent, record } = await fixture()
  const a = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'agent-proposal' })
  const b = await kernel.stage(human, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'human-proposal' })
  assert.deepEqual(a.checks, b.checks)
  assert.deepEqual(a.change?.after, b.change?.after)
})

test('cross-workspace reads, record staging, and proposal review are refused', async () => {
  const a = await fixture(), b = await fixture()
  assert.equal(b.snapshot.records.some(r => r.id === a.record.id), false)
  await assert.rejects(kernel.snapshot({ ...a.human, workspaceId: b.human.workspaceId }), /access/)
  await assert.rejects(kernel.stage(b.agent, { recordId: a.record.id, action: 'approve', input: {}, idempotencyKey: 'cross-tenant' }), /not found/)
  const staged = await kernel.stage(a.agent, { recordId: a.record.id, action: 'approve', input: {}, idempotencyKey: 'own-proposal' })
  await assert.rejects(kernel.review(b.human, staged.change!.id, 'apply'), /not found/)
})

test('idempotency returns the existing proposal and rejects a changed request', async () => {
  const { agent, record } = await fixture()
  const command = { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'stable-retry' }
  const first = await kernel.stage(agent, command)
  const second = await kernel.stage(agent, command)
  assert.equal(first.change!.id, second.change!.id)
  await assert.rejects(kernel.stage(agent, { ...command, action: 'decline', input: { reason: 'Changed intent' } }), /different proposal/)
})

test('a competing applied proposal makes the old record version stale', async () => {
  const { human, agent, record } = await fixture()
  const a = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'first-proposal' })
  const b = await kernel.stage(agent, { recordId: record.id, action: 'decline', input: { reason: 'Budget has been reallocated' }, idempotencyKey: 'second-proposal' })
  await kernel.review(human, a.change!.id, 'apply')
  await assert.rejects(kernel.review(human, b.change!.id, 'apply'), /changed/)
  assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: record.id } })).version, 2)
})

test('publishing policies versions the definition and invalidates old proposals', async () => {
  const { human, agent, record } = await fixture()
  const staged = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'before-publish' })
  const published = await kernel.updatePolicies(human, 1, { approvalLimitCents: 100000, requireVerifiedSupplier: true })
  assert.equal(published.version, 2)
  await assert.rejects(kernel.review(human, staged.change!.id, 'apply'), /changed/)
  const next = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'after-publish' })
  assert.equal(next.status, 'blocked')
  await assert.rejects(kernel.updatePolicies(human, 1, { approvalLimitCents: 1000000, requireVerifiedSupplier: true }), /newer/)
  const cap = await db.capability.findFirstOrThrow({ where: { workspaceId: human.workspaceId, slug: 'procurement' } })
  assert.equal(await db.capabilityVersion.count({ where: { capabilityId: cap.id } }), 2)
})

test('rejecting does not mutate the business record', async () => {
  const { human, agent, record } = await fixture()
  const proposal = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'reject-proposal' })
  await kernel.review(human, proposal.change!.id, 'reject')
  assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: record.id } })).version, 1)
  await assert.rejects(kernel.review(human, proposal.change!.id, 'apply'), /resolved/)
})

test('creation rejects unknown fields and direct status injection', async () => {
  const { human } = await fixture()
  const data = { title: 'New request', supplier: 'Supplier', amountCents: 10000, category: 'Office', justification: 'Office supplies needed' }
  await assert.rejects(kernel.createRecord(human, { ...data, status: 'approved' }), /set by the kernel/)
  await assert.rejects(kernel.createRecord(human, { ...data, workspaceId: 'someone-else' }), /Unknown field/)
  const record = await kernel.createRecord(human, data)
  assert.equal((record.data as RecordData).status, 'draft')
  assert.equal((record.data as RecordData).supplierVerified, false)
})

test('revoked proposal permissions are checked again at apply', async () => {
  const { human, agent, record } = await fixture()
  const staged = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'revoke-proposer' })
  await db.membership.update({ where: { userId: human.userId }, data: { role: 'viewer' } })
  await assert.rejects(kernel.review(human, staged.change!.id, 'apply'), /access/)
  await assert.rejects(kernel.review({ ...human, role: 'viewer' }, staged.change!.id, 'apply'), /review/)
})

test('required action input and monetary bounds are enforced', () => {
  const record = { title: 'Request', supplier: 'Supplier', amountCents: 100, category: 'Office', justification: 'Reason here', supplierVerified: true, status: 'submitted', decisionNote: '' }
  assert.throws(() => evaluate(procurement, 'decline', record, {}, 'owner'), /required/)
  assert.throws(() => validateFields(procurement.entity.fields, { ...record, amountCents: 1.5 }), /whole/)
  assert.throws(() => validateFields(procurement.entity.fields, { ...record, amountCents: -1 }), /range/)
})

test('a workspace installs Site, Blog, Procurement, and suite packages', async () => {
  const { snapshot } = await fixture()
  assert.deepEqual(snapshot.capabilities.map(cap => cap.slug).sort(), ['assets', 'audit', 'blog', 'crm', 'helpdesk', 'hr', 'orders', 'procurement', 'projects', 'site'])
  assert.equal(snapshot.records.filter(record => record.capability === 'site').length, 1)
  assert.equal(snapshot.records.filter(record => record.capability === 'blog').length, 3)
  assert.equal(snapshot.records.filter(record => record.capability === 'procurement').length, 6)
  assert.equal(snapshot.records.filter(record => record.capability === 'crm').length, 3)
})

test('a workspace has Site, Procurement, operations, and Audit projects', async () => {
  const { human, snapshot } = await fixture()
  assert.deepEqual(snapshot.projects.map(project => [project.slug, project.shell, project.packages]), [
    ['site', 'site', ['site', 'blog']],
    ['procurement', 'workbench', ['procurement']],
    ['crm', 'workbench', ['crm']],
    ['orders', 'workbench', ['orders']],
    ['helpdesk', 'workbench', ['helpdesk']],
    ['projects', 'workbench', ['projects']],
    ['assets', 'workbench', ['assets']],
    ['hr', 'workbench', ['hr']],
    ['audit', 'workbench', ['audit']],
  ])
  const site = await kernel.snapshot(human, 'site')
  assert.equal(site.project?.slug, 'site')
  assert.deepEqual(site.capabilities.map(cap => cap.slug), ['site', 'blog'])
  assert.equal(site.records.some(record => record.capability === 'procurement'), false)
  const procurementProject = await kernel.snapshot(human, 'procurement')
  assert.deepEqual(procurementProject.capabilities.map(cap => cap.slug), ['procurement'])
  assert.equal(procurementProject.records.some(record => record.capability === 'blog' || record.capability === 'site'), false)
  const crm = await kernel.snapshot(human, 'crm')
  assert.deepEqual(crm.capabilities.map(cap => cap.slug), ['crm'])
  assert.equal(crm.records.length, 3)
  assert.equal(crm.records.some(record => record.capability !== 'crm'), false)
  const audit = await kernel.snapshot(human, 'audit')
  assert.deepEqual(audit.capabilities.map(cap => cap.slug), ['audit'])
  assert.equal(audit.records.length, 4)
  assert.equal(audit.records.some(record => record.capability !== 'audit'), false)
  await assert.rejects(kernel.snapshot(human, 'missing'), (error: unknown) => error instanceof KernelError && error.code === 'NOT_FOUND')
})

test('audit assessment is staged; remediation is blocked until it is applied', async () => {
  const { human, agent, snapshot } = await fixture()
  const finding = snapshot.records.find(record => record.capability === 'audit' && (record.data as RecordData).title === 'Privileged access recertification')!
  const blocked = await kernel.stage(agent, { recordId: finding.id, action: 'remediate', input: {}, idempotencyKey: 'remediate-before-assess' })
  assert.equal(blocked.status, 'blocked')
  const staged = await kernel.stage(agent, {
    recordId: finding.id, action: 'assess',
    input: { assessment: 'Admin roles include contractors who are outside the recertification roster.', confidence: 76 },
    idempotencyKey: 'assess-finding',
  })
  assert.equal(staged.status, 'staged')
  await kernel.review(human, staged.change!.id, 'apply')
  const updated = await db.businessRecord.findUniqueOrThrow({ where: { id: finding.id } })
  assert.equal((updated.data as RecordData).assessed, true)
  assert.equal((updated.data as RecordData).confidence, 76)
  const remediating = await kernel.stage(agent, { recordId: finding.id, action: 'remediate', input: {}, idempotencyKey: 'remediate-after-assess' })
  assert.equal(remediating.status, 'staged')
})

test('CRM convert is staged and applied like every other kernel action', async () => {
  const { human, agent, snapshot } = await fixture()
  const lead = snapshot.records.find(record => record.capability === 'crm' && (record.data as RecordData).title === 'Northwind Foods')!
  const staged = await kernel.stage(agent, { recordId: lead.id, action: 'convert', input: {}, idempotencyKey: 'convert-lead' })
  assert.equal(staged.status, 'staged')
  await kernel.review(human, staged.change!.id, 'apply')
  assert.equal(((await db.businessRecord.findUniqueOrThrow({ where: { id: lead.id } })).data as RecordData).status, 'converted')
})

test('the public site is composed from published package views only', async () => {
  const { human, snapshot } = await fixture()
  const site = await kernel.publicSite(human.workspaceId)
  assert.deepEqual(site.blocks.map(block => block.slug), ['site', 'blog'])
  assert.equal(site.blocks[0].view, 'hero')
  assert.equal(site.blocks[1].records.length, 2)
  assert.equal(site.blocks[1].records.some(record => record.data.status !== 'published'), false)
  assert.equal(site.blocks.some(block => block.records.some(record => snapshot.records.some(item => item.id === record.id && item.capability === 'procurement'))), false)
  const draft = snapshot.records.find(record => record.capability === 'blog' && (record.data as RecordData).status === 'draft')!
  assert.equal(site.blocks[1].records.some(record => record.id === draft.id), false)
})

test('applying a blog publish makes the note public', async () => {
  const { human, agent, snapshot } = await fixture()
  const draft = snapshot.records.find(record => record.capability === 'blog' && (record.data as RecordData).status === 'draft')!
  const staged = await kernel.stage(agent, { recordId: draft.id, action: 'publish', input: {}, idempotencyKey: 'publish-note' })
  assert.equal(staged.status, 'staged')
  await kernel.review(human, staged.change!.id, 'apply')
  const site = await kernel.publicSite(human.workspaceId)
  const notes = site.blocks.find(block => block.slug === 'blog')!
  assert.equal(notes.records.some(record => record.id === draft.id), true)
})

test('composePublic skips drafts and packages without a public view', () => {
  const blocks = composePublic([
    { id: '1', capability: 'site', data: { title: 'Live', standfirst: 'Standfirst here', body: 'Body copy here', status: 'published' }, createdAt: '2026-09-11' },
    { id: '2', capability: 'site', data: { title: 'Hidden', standfirst: 'Standfirst here', body: 'Body copy here', status: 'draft' }, createdAt: '2026-09-11' },
    { id: '3', capability: 'blog', data: { title: 'Note', excerpt: 'Excerpt here', body: 'Body copy here', status: 'published' }, createdAt: '2026-09-11' },
    { id: '4', capability: 'procurement', data: { title: 'PO', status: 'approved' }, createdAt: '2026-09-11' },
  ])
  assert.deepEqual(blocks.map(block => [block.slug, block.view, block.records.map(record => record.id)]), [
    ['site', 'hero', ['1']],
    ['blog', 'article-list', ['3']],
  ])
})

test('composeEditorial includes drafts and omits procurement', () => {
  const blocks = composeEditorial([
    { id: '1', capability: 'site', data: { title: 'Live', standfirst: 'Standfirst here', body: 'Body copy here', status: 'published' }, createdAt: '2026-09-11' },
    { id: '2', capability: 'site', data: { title: 'Hidden', standfirst: 'Standfirst here', body: 'Body copy here', status: 'draft' }, createdAt: '2026-09-11' },
    { id: '3', capability: 'blog', data: { title: 'Note', excerpt: 'Excerpt here', body: 'Body copy here', status: 'published' }, createdAt: '2026-09-11' },
    { id: '4', capability: 'procurement', data: { title: 'PO', status: 'approved' }, createdAt: '2026-09-11' },
  ])
  assert.deepEqual(blocks.map(block => [block.slug, block.records.map(record => record.id)]), [
    ['site', ['1', '2']],
    ['blog', ['3']],
  ])
})
