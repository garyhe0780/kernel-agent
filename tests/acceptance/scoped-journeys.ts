import assert from 'node:assert/strict'
import { Kernel } from '../../src/kernel/engine.server'
import { AgentAccess } from '../../src/kernel/agent-access.server'
import { EmbeddedAgent } from '../../src/kernel/embedded-agent.server'
import { planScopedOperation } from '../../src/kernel/model.server'
import { CREATE_ACTION } from '../../src/kernel/record-operations'
import type { Principal, RecordData } from '../../src/kernel/definition'
import type { RunReceipt } from '../../src/kernel/agent-runs'
import { openTestDatabase } from '../test-database'

/** Synthetic data and in-memory Postgres only; never reads DATABASE_URL. */
export async function scopedJourney(pattern: 'crm' | 'issues', live = false) {
  const { db, close } = await openTestDatabase()
  const checks: string[] = []
  let modelCalls = 0
  try {
    const kernel = new Kernel(db), access = new AgentAccess(db)
    const user = await db.user.create({ data: { id: `accept-${pattern}`, name: 'Synthetic acceptance owner', email: `${pattern}@acceptance.test` } })
    const member = await kernel.ensureWorkspace(user)
    const owner: Principal = { userId: user.id, workspaceId: member.workspaceId, role: 'owner', name: user.name, kind: 'human' }
    const builder = await access.create(owner, { kind: 'construct', name: 'Synthetic builder', expiresInDays: 1 })
    const builderPrincipal = await access.authenticate(builder.token)
    const draft = await kernel.saveDraft(builderPrincipal, { brief: `Synthetic ${pattern} acceptance`, pattern, source: 'agent' })
    const published = await kernel.publishDraft(builderPrincipal, draft.id, draft.version)
    assert.equal((await kernel.snapshot(owner, published.slug)).records.length, 0)
    checks.push('Scoped builder publishes an empty application from the catalog')
    const crm = pattern === 'crm'
    const capability = `${published.slug}__${crm ? 'opportunities' : 'issues'}`
    const parentCapability = `${published.slug}__${crm ? 'customers' : 'projects'}`
    const parent = await kernel.createRecord(owner, { title: 'Synthetic Acme' }, parentCapability)
    const actions = crm ? ['open', 'convert'] : ['start', 'complete']
    const terminal = crm ? 'converted' : 'done'
    const initial = crm ? 'draft' : 'backlog'
    const active = crm ? 'open' : 'started'
    const credential = await access.create(owner, { project: published.slug, name: 'Synthetic scoped assistant', expiresInDays: 1,
      actions: [CREATE_ACTION, ...actions].map((action, index) => ({ capability, action, version: 1, execution: index === 1 ? 'automatic' : 'review' })) })
    const agent = await access.authenticate(credential.token)
    const input = crm ? { title: 'Synthetic acceptance opportunity', source: 'Inbound', customer: parent.id } : { title: 'Synthetic acceptance issue', priority: 'high', project: parent.id }
    const steps = [
      { operation: 'create', capability, input, execution: 'review' },
      ...actions.map((action, index) => ({ operation: 'action', capability, record: { step: 0 }, action, input: {}, execution: index === 0 ? 'automatic' : 'review' })),
    ]
    const command = { project: published.slug, credentialId: credential.credential.id, allowAutomatic: true, idempotencyKey: `acceptance-${pattern}`,
      instruction: `Synthetic acceptance task: create exactly one ${crm ? 'opportunity' : 'issue'} titled "${input.title}" linked to Synthetic Acme (${parent.id}). ${crm ? 'Use source Inbound.' : 'Use priority high.'} Then ${actions[0]} it, then ${actions[1]} it. Plan all three steps in order. Creation and final action require review; the middle action may execute automatically under its grant. Use earlier-step references for the new record. Do not create the parent or invent evidence.` }
    const service = new EmbeddedAgent(db, kernel, access, async context => {
      modelCalls++
      if (live) {
        const plan = await planScopedOperation(context)
        console.log('PLAN', JSON.stringify({ pattern, queries: plan.queries, steps: plan.steps }))
        return plan
      }
      return { explanation: 'Create, progress, and finish with required review.', queries: [], steps }
    })
    const planned = await service.operate(owner, command)
    assert.ok(planned.run, planned.explanation)
    const plan = planned.run.steps as typeof steps
    assert.equal(plan.length, 3, 'Planner must produce the three requested steps')
    assert.equal(plan[0].operation, 'create')
    assert.deepEqual(plan.map(s => s.execution), ['review', 'automatic', 'review'])
    assert.deepEqual(plan.slice(1).map(s => 'action' in s ? s.action : undefined), actions)
    checks.push(`${live ? 'Live' : 'Deterministic'} planner produces the requested scoped three-step workflow`)
    const read = async (id: string) => (await db.businessRecord.findUniqueOrThrow({ where: { id } })).data as RecordData
    // Use fresh Kernel instances to exercise recovery from persisted checkpoints.
    await new Kernel(db).advanceAgentRun(planned.run.id)
    let run = await kernel.agentRun(agent, { runId: planned.run.id })
    assert.equal(run.status, 'waiting')
    const creation = (run.receipts as RunReceipt[])[0]
    assert.equal(await db.businessRecord.count({ where: { id: creation.recordId } }), 0)
    await assert.rejects(kernel.review(agent, creation.changeId, 'apply'))
    await kernel.review(owner, creation.changeId, 'apply')
    assert.equal((await read(creation.recordId)).status, initial)
    assert.equal((await read(creation.recordId))[crm ? 'customer' : 'project'], parent.id)
    checks.push('Creation waits for a human; review creates exactly one correctly linked record')
    await new Kernel(db).advanceAgentRun(run.id)
    await new Kernel(db).advanceAgentRun(run.id)
    assert.equal((await read(creation.recordId)).status, active)
    await new Kernel(db).advanceAgentRun(run.id)
    run = await kernel.agentRun(agent, { runId: run.id })
    assert.equal(run.status, 'waiting')
    assert.equal((await read(creation.recordId)).status, active)
    const final = (run.receipts as RunReceipt[])[2]
    await kernel.review(owner, final.changeId, 'apply')
    await new Kernel(db).advanceAgentRun(run.id)
    assert.equal((await kernel.agentRun(agent, { runId: run.id })).status, 'completed')
    assert.equal((await read(creation.recordId)).status, terminal)
    checks.push('Restart recovery preserves the automatic middle step and reviewed final transition')
    const repeated = await new EmbeddedAgent(db, kernel, access, async () => { assert.fail('Retry must not call the model') }).operate(owner, command)
    assert.equal(repeated.run?.id, run.id)
    const query = await kernel.queryRecords(agent, { capability, filters: [{ field: 'status', value: terminal }] })
    assert.equal(query.records.length, 1)
    const applied = await db.execution.findMany({ where: { workspaceId: owner.workspaceId, recordId: creation.recordId, outcome: 'applied' } })
    assert.equal(applied.length, 3)
    assert.equal(applied.filter(e => e.actorKind === 'agent').length, 1)
    assert.equal(applied.filter(e => e.actorKind === 'human').length, 2)
    checks.push('Submission replay, targeted terminal-state query, and human/agent audit attribution agree')
    const cancel = await kernel.startAgentRun(agent, { idempotencyKey: 'acceptance-cancel', steps: steps.slice(0, 1) })
    await kernel.advanceAgentRun(cancel.id)
    const cancelled = await kernel.agentRun(owner, { runId: cancel.id, command: 'cancel' })
    assert.equal(cancelled.status, 'cancelled')
    const cancelledReceipt = (cancelled.receipts as RunReceipt[])[0]
    await assert.rejects(kernel.review(owner, cancelledReceipt.changeId, 'apply'))
    assert.equal(await db.businessRecord.count({ where: { id: cancelledReceipt.recordId } }), 0)
    checks.push('Cancellation closes its pending proposal without creating another record')
    return { pattern, mode: live ? 'live' : 'deterministic', modelCalls, checks, status: 'passed' }
  } finally { await close() }
}
