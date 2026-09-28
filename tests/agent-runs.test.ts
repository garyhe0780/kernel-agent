import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { openTestDatabase } from './test-database'
import { Kernel } from '../src/kernel/engine.server'
import { AgentAccess } from '../src/kernel/agent-access.server'
import { CREATE_ACTION } from '../src/kernel/record-operations'
import { handleMcp } from '../src/lib/mcp.server'
import { handleAgentCredential } from '../src/lib/agent-api.server'
import type { Principal, RecordData } from '../src/kernel/definition'

const { db, close } = await openTestDatabase()
after(close)
const kernel = new Kernel(db), access = new AgentAccess(db)
let sequence = 0
async function fixture(execution?: 'review' | 'automatic') {
  const user = await db.user.create({ data: { id: `runs-${++sequence}`, name: 'Owner', email: `runs-${sequence}@example.test` } })
  const member = await kernel.ensureWorkspace(user)
  const human: Principal = { userId: user.id, name: user.name, workspaceId: member.workspaceId, role: 'owner', kind: 'human' }
  const draft = await kernel.saveDraft(human, { brief: 'Automatic sales operation tests', pattern: 'crm', source: 'manual' })
  const { slug } = await kernel.publishDraft(human, draft.id, draft.version)
  const capability = `${slug}__opportunities`
  const customer = await kernel.createRecord(human, { title: 'Customer account' }, `${slug}__customers`)
  const input = { title: 'Qualified opportunity', source: 'Inbound', customer: customer.id }
  const credential = await access.create(human, { project: slug, name: 'Sales agent', expiresInDays: 30, actions: [CREATE_ACTION, 'open', 'convert'].map(action => ({ capability, action, version: 1, ...(execution ? { execution } : {}) })) })
  const agent = await access.authenticate(credential.token)
  return { human, agent, credential, slug, capability, input, customer }
}
async function connect(token: string) {
  const client = new Client({ name: 'automatic-test', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost:3000/api/mcp'), { requestInit: { headers: { Authorization: `Bearer ${token}` } }, fetch: async (url, init) => handleMcp(new Request(url, init), access, kernel) }))
  return client
}

function steps(f: Awaited<ReturnType<typeof fixture>>, execution: 'review' | 'automatic' = 'automatic') {
  return [
    { operation: 'create', capability: f.capability, input: f.input, execution },
    { operation: 'action', capability: f.capability, record: { step: 0 }, action: 'open', input: {}, execution: 'automatic' },
  ]
}

test('durable runs resume in a new kernel, bind prior records, and survive competing workers exactly once', async () => {
  const f = await fixture('automatic')
  const command = { idempotencyKey: 'run-create-open', steps: steps(f) }
  const [run, duplicate] = await Promise.all([kernel.startAgentRun(f.agent, command), kernel.startAgentRun(f.agent, command)])
  assert.equal(run.id, duplicate.id)
  await assert.rejects(kernel.startAgentRun(f.agent, { ...command, steps: steps(f).slice(0, 1) }), /different run/)
  await Promise.all([kernel.advanceAgentRun(run.id), kernel.advanceAgentRun(run.id)])
  const fresh = new Kernel(db)
  await fresh.advanceAgentRun(run.id)
  await fresh.advanceAgentRun(run.id)
  const result = await fresh.agentRun(f.agent, { runId: run.id })
  assert.equal(result.status, 'completed')
  assert.equal(result.nextStep, 2)
  const receipts = result.receipts as { changeId: string; recordId: string }[]
  assert.equal(receipts[0].recordId, receipts[1].recordId)
  assert.equal(await db.changeSet.count({ where: { workspaceId: f.human.workspaceId } }), 2)
  assert.equal(((await db.businessRecord.findUniqueOrThrow({ where: { id: receipts[0].recordId } })).data as RecordData).status, 'open')
})

test('review steps pause, approval resumes, rejection stops subsequent work', async () => {
  const f = await fixture('automatic')
  for (const decision of ['apply', 'reject'] as const) {
    const run = await kernel.startAgentRun(f.agent, { idempotencyKey: `review-run-${decision}`, steps: steps(f, 'review') })
    await kernel.advanceAgentRun(run.id)
    const waiting = await kernel.agentRun(f.agent, { runId: run.id, command: 'advance' })
    assert.equal(waiting.status, 'waiting')
    assert.equal(waiting.nextStep, 0)
    const receipt = (waiting.receipts as { changeId: string; recordId: string }[])[0]
    assert.equal(await db.businessRecord.count({ where: { id: receipt.recordId } }), 0)
    await kernel.review(f.human, receipt.changeId, decision)
    await kernel.advanceAgentRun(run.id)
    await kernel.advanceAgentRun(run.id)
    const result = await kernel.agentRun(f.agent, { runId: run.id })
    assert.equal(result.status, decision === 'apply' ? 'completed' : 'failed')
    assert.equal((result.receipts as unknown[]).length, decision === 'apply' ? 2 : 1)
  }
})

test('cancellation rejects outstanding proposals and prevents future steps', async () => {
  const f = await fixture('automatic')
  const run = await kernel.startAgentRun(f.agent, { idempotencyKey: 'cancel-review-run', steps: steps(f, 'review') })
  await kernel.advanceAgentRun(run.id)
  const result = await kernel.agentRun(f.human, { runId: run.id, command: 'cancel' })
  assert.equal(result.status, 'cancelled')
  const receipt = (result.receipts as { changeId: string; recordId: string }[])[0]
  assert.equal((await db.changeSet.findUniqueOrThrow({ where: { id: receipt.changeId } })).status, 'rejected')
  await assert.rejects(kernel.review(f.human, receipt.changeId, 'apply'))
  assert.equal(await kernel.advanceAgentRun(run.id), false)
  assert.equal(await db.businessRecord.count({ where: { id: receipt.recordId } }), 0)
})

test('run scope, forward references, revocation and current owner membership are enforced', async () => {
  const f = await fixture('automatic'), other = await fixture('automatic'), review = await fixture()
  await assert.rejects(kernel.startAgentRun(review.agent, { idempotencyKey: 'review-no-auto', steps: steps(review) }), /Human review/)
  await assert.rejects(kernel.startAgentRun(f.agent, { idempotencyKey: 'forward-reference', steps: [steps(f)[1]] }), /earlier step/)
  const run = await kernel.startAgentRun(f.agent, { idempotencyKey: 'revoked-run-key', steps: steps(f) })
  await assert.rejects(kernel.agentRun(other.agent, { runId: run.id }), /not found/)
  await kernel.advanceAgentRun(run.id)
  await access.revoke(f.human, f.credential.credential.id)
  await kernel.advanceAgentRun(run.id)
  const result = await kernel.agentRun(f.human, { runId: run.id })
  assert.equal(result.status, 'failed')
  assert.equal(result.nextStep, 1)
  assert.equal(await db.changeSet.count({ where: { workspaceId: f.human.workspaceId } }), 1)
})

test('a checkpoint failure rolls back its record mutation and retry uses the same step key', async () => {
  const f = await fixture('automatic')
  const run = await kernel.startAgentRun(f.agent, { idempotencyKey: 'rollback-run-key', steps: steps(f) })
  await db.$executeRawUnsafe(`ALTER TABLE "AgentRun" ADD CONSTRAINT "test_run_checkpoint" CHECK ("nextStep" = 0) NOT VALID`)
  try {
    await kernel.advanceAgentRun(run.id)
    assert.equal((await kernel.agentRun(f.agent, { runId: run.id })).status, 'failed')
    assert.equal(await db.changeSet.count({ where: { workspaceId: f.human.workspaceId } }), 0)
  } finally { await db.$executeRawUnsafe('ALTER TABLE "AgentRun" DROP CONSTRAINT "test_run_checkpoint"') }
  await kernel.agentRun(f.agent, { runId: run.id, command: 'retry' })
  await kernel.advanceAgentRun(run.id)
  await kernel.advanceAgentRun(run.id)
  assert.equal((await kernel.agentRun(f.agent, { runId: run.id })).status, 'completed')
  assert.equal(await db.changeSet.count({ where: { workspaceId: f.human.workspaceId } }), 2)
})

test('MCP and HTTP expose scoped run submission and management', async () => {
  const f = await fixture('automatic'), client = await connect(f.credential.token)
  try {
    assert.ok((await client.listTools()).tools.some(t => t.name === 'start_run'))
    const submitted = await client.callTool({ name: 'start_run', arguments: { idempotencyKey: 'mcp-run-submission', steps: steps(f) } })
    assert.equal(submitted.isError, false, JSON.stringify(submitted))
    const runId = (submitted.structuredContent as { id: string }).id
    const advanced = await client.callTool({ name: 'manage_run', arguments: { runId, command: 'advance' } })
    assert.equal((advanced.structuredContent as { nextStep: number }).nextStep, 1)
    const response = await handleAgentCredential(new Request('http://localhost/api/agent', { method: 'POST', headers: { Authorization: `Bearer ${f.credential.token}` }, body: JSON.stringify({ type: 'manage_run', runId, command: 'cancel' }) }), access, kernel)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).status, 'cancelled')
  } finally { await client.close() }
})

test('inspection exposes receipt evidence and cancellation history only to the owner or originating credential', async () => {
  const f = await fixture('automatic'), other = await fixture('automatic')
  const run = await kernel.startAgentRun(f.agent, { idempotencyKey: 'inspect-mixed-run', steps: [steps(f)[0], { ...steps(f)[1], execution: 'review' }] })
  await kernel.advanceAgentRun(run.id)
  await kernel.advanceAgentRun(run.id)
  const waiting = await kernel.agentRun(f.human, { runId: run.id })
  assert.deepEqual(waiting.inspection.map(s => s.status), ['applied', 'waiting'])
  assert.equal(waiting.inspection[0].proposal?.executionMode, 'automatic')
  assert.equal(waiting.inspection[0].proposal?.reviewedBy, null)
  assert.equal(waiting.inspection[0].recordId, waiting.inspection[1].recordId)
  assert.equal((waiting.inspection[0].proposal?.after as RecordData).title, f.input.title)
  await assert.rejects(kernel.agentRun(other.human, { runId: run.id }), /not found/)
  const secondGrant = await access.create(f.human, { project: f.slug, name: 'Other agent', expiresInDays: 1, actions: [{ capability: f.capability, action: 'open', version: 1 }] })
  await assert.rejects(kernel.agentRun(await access.authenticate(secondGrant.token), { runId: run.id }), /not found/)
  const cancelled = await kernel.agentRun(f.human, { runId: run.id, command: 'cancel' })
  assert.deepEqual(cancelled.inspection.map(s => s.status), ['applied', 'cancelled'])
  assert.equal(cancelled.inspection[1].proposal?.status, 'rejected')
  assert.ok(cancelled.history.some(event => event.action === 'run.cancel' && event.actorKind === 'human'))
  assert.match(cancelled.recovery.message, /Applied changes remain/)
})

test('rejected proposals require a revised task and cannot be retried', async () => {
  const f = await fixture('automatic')
  const run = await kernel.startAgentRun(f.agent, { idempotencyKey: 'inspect-rejected-run', steps: steps(f, 'review') })
  await kernel.advanceAgentRun(run.id)
  const waiting = await kernel.agentRun(f.agent, { runId: run.id })
  await kernel.review(f.human, waiting.inspection[0].proposal!.id, 'reject')
  await kernel.advanceAgentRun(run.id)
  const failed = await kernel.agentRun(f.human, { runId: run.id })
  assert.equal(failed.recovery.canRetry, false)
  assert.deepEqual(failed.inspection.map(s => s.status), ['rejected', 'not started'])
  await assert.rejects(kernel.agentRun(f.human, { runId: run.id, command: 'retry' }), /rejected/)
  assert.equal((await db.agentRun.findUniqueOrThrow({ where: { id: run.id } })).status, 'failed')
})

test('concurrent run admission is capped, replay is free, and cancellation releases capacity', async () => {
  const f = await fixture('automatic')
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => kernel.startAgentRun(f.agent, { idempotencyKey: `capacity-run-${index}`, steps: steps(f) })))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 5)
  assert.equal(results.filter(r => r.status === 'rejected').length, 1)
  const runs = await db.agentRun.findMany({ where: { agentCredentialId: f.agent.agentCredentialId } })
  assert.equal((await kernel.startAgentRun(f.agent, { idempotencyKey: runs[0].idempotencyKey, steps: steps(f) })).id, runs[0].id)
  await db.agentRun.update({ where: { id: runs[0].id }, data: { status: 'failed', error: { code: 'STEP_FAILED', message: 'temporary' } } })
  await kernel.startAgentRun(f.agent, { idempotencyKey: 'capacity-replacement', steps: steps(f) })
  await assert.rejects(kernel.agentRun(f.human, { runId: runs[0].id, command: 'retry' }), /five active runs/)
  await kernel.agentRun(f.human, { runId: runs[1].id, command: 'cancel' })
  assert.equal((await kernel.agentRun(f.human, { runId: runs[0].id, command: 'retry' })).status, 'queued')
})

test('operation rate limits cover direct calls and workers without charging replays', async () => {
  const f = await fixture('automatic')
  const input = { capability: f.capability, input: f.input, idempotencyKey: 'rate-first-create' }
  const first = await kernel.stageCreate(f.agent, input)
  const row = await db.changeSet.findUniqueOrThrow({ where: { id: first.change.id } })
  await db.changeSet.createMany({ data: Array.from({ length: 59 }, (_, i) => ({ ...row, id: `quota-${row.id}-${i}`, idempotencyKey: `quota-key-${row.id}-${i}`, input: row.input!, before: row.before!, after: row.after!, checks: row.checks! })) })
  assert.equal((await kernel.stageCreate(f.agent, input)).change.id, first.change.id)
  await assert.rejects(kernel.executeAgent(f.agent, { ...input, operation: 'create', idempotencyKey: 'rate-auto-denied' }), /60 new operations/)
  const record = await kernel.createRecord(f.human, f.input, f.capability)
  await assert.rejects(kernel.stage(f.agent, { recordId: record.id, action: 'open', input: {}, idempotencyKey: 'rate-action-denied' }), /60 new operations/)
  const run = await kernel.startAgentRun(f.agent, { idempotencyKey: 'rate-worker-run', steps: steps(f) })
  await kernel.advanceAgentRun(run.id)
  const deferred = await kernel.agentRun(f.human, { runId: run.id })
  assert.equal(deferred.status, 'queued')
  assert.equal(deferred.nextStep, 0)
  assert.equal(deferred.inspection[0].proposal, null)
  await db.changeSet.updateMany({ where: { agentCredentialId: f.agent.agentCredentialId }, data: { createdAt: new Date(Date.now() - 61_000) } })
  await kernel.advanceAgentRun(run.id)
  assert.equal((await kernel.agentRun(f.human, { runId: run.id })).nextStep, 1)
})

test('expired runs reject outstanding review, preserve applied records, and cannot restart', async () => {
  const f = await fixture('automatic')
  const run = await kernel.startAgentRun(f.agent, { idempotencyKey: 'expired-mixed-run', steps: [steps(f)[0], { ...steps(f)[1], execution: 'review' }] })
  await kernel.advanceAgentRun(run.id)
  await kernel.advanceAgentRun(run.id)
  const waiting = await kernel.agentRun(f.human, { runId: run.id })
  await db.agentRun.update({ where: { id: run.id }, data: { createdAt: new Date(Date.now() - 8 * 86_400_000) } })
  await assert.rejects(kernel.review(f.human, waiting.inspection[1].proposal!.id, 'apply'), /deadline/)
  await kernel.advanceAgentRun(run.id)
  const expired = await kernel.agentRun(f.human, { runId: run.id })
  assert.equal(expired.status, 'failed')
  assert.equal(expired.inspection[0].status, 'applied')
  assert.equal(expired.inspection[1].proposal?.status, 'rejected')
  assert.ok(expired.history.some(event => event.action === 'run.expire'))
  assert.equal(expired.recovery.canRetry, false)
  await assert.rejects(kernel.agentRun(f.human, { runId: run.id, command: 'retry' }), /seven days/)
  assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: expired.inspection[0].recordId! } })).data instanceof Object, true)
})

test('worker heartbeat and stalled detection are durable and owner-only', async () => {
  const f = await fixture('automatic'), other = await fixture('automatic')
  const run = await kernel.startAgentRun(f.agent, { idempotencyKey: 'stalled-work-run', steps: steps(f) })
  await db.agentRun.update({ where: { id: run.id }, data: { updatedAt: new Date(Date.now() - 120_000) } })
  assert.equal((await kernel.agentRun(f.human, { runId: run.id })).stalled, true)
  assert.equal((await kernel.agentWorkerHealth(f.human)).stalled, 1)
  assert.equal((await kernel.agentWorkerHealth(other.human)).stalled, 0)
  await assert.rejects(kernel.agentWorkerHealth(f.agent), /Only workspace owners|scope/)
  await kernel.pollAgentRuns()
  assert.equal((await new Kernel(db).agentWorkerHealth(f.human)).status, 'healthy')
  await db.agentWorkerHealth.update({ where: { id: 'operations' }, data: { lastSuccessAt: new Date(0) } })
  assert.equal((await kernel.agentWorkerHealth(f.human)).status, 'unavailable')
})

test('poll failure is recorded without exposing details and the next successful poll recovers health', async () => {
  const f = await fixture('automatic')
  const failing = new Kernel(db)
  failing.advanceAgentRun = async () => { throw new Error('Synthetic connection failure') }
  await db.agentWorkerHealth.upsert({ where: { id: 'operations' }, create: { id: 'operations', lastSuccessAt: new Date(Date.now() - 1000) }, update: { lastSuccessAt: new Date(Date.now() - 1000) } })
  await assert.rejects(failing.pollAgentRuns(), /Synthetic/)
  const health = await kernel.agentWorkerHealth(f.human)
  assert.equal(health.status, 'degraded')
  assert.ok(health.lastFailureAt)
  assert.equal(JSON.stringify(health).includes('Synthetic'), false)
  await kernel.pollAgentRuns()
  assert.equal((await kernel.agentWorkerHealth(f.human)).status, 'healthy')
})
