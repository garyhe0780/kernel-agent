import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { Kernel, KernelError } from '../src/kernel/engine.server'
import { evaluate, procurement, validateFields, type Principal, type RecordData } from '../src/kernel/definition'

const folder = mkdtempSync(join(tmpdir(), 'kernel-tests-'))
const db = new PrismaClient({ datasourceUrl: `file:${join(folder, 'test.db')}` })
const kernel = new Kernel(db)
let sequence = 0

before(async () => {
  const migration = readFileSync(new URL('../prisma/migrations/202609100001_initial/migration.sql', import.meta.url), 'utf8')
  for (const statement of migration.split(';').filter(s => s.trim())) await db.$executeRawUnsafe(statement)
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
  const cap = await db.capability.findFirstOrThrow({ where: { workspaceId: human.workspaceId } })
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
