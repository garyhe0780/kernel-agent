import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { Kernel } from '../src/kernel/engine.server'
import { openTestDatabase } from './test-database'
import { KernelError } from '../src/kernel/errors'
import { BuildJobs } from '../src/kernel/build-jobs.server'
import { nextBuildTask, executeBuildTask, type BuildInput, type Checkpoints } from '../src/kernel/build-pipeline.server'
import { purchasingAssembly, purchasingExample } from '../src/kernel/application'
import type { Principal } from '../src/kernel/definition'
import { modelJson } from '../src/kernel/model.server'
import { buildJobResponse } from '../src/lib/build-job-stream.server'

const { db, close } = await openTestDatabase()
const kernel = new Kernel(db)
let sequence = 0
const app = purchasingExample()
const assembly = purchasingAssembly()
const completed = (value: unknown) => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] })
const fetcher: typeof fetch = async () => completed(assembly)
const execute = (input: BuildInput, checkpoints: Checkpoints) => executeBuildTask(input, checkpoints, fetcher)
let oldKey: string | undefined, oldModel: string | undefined
before(async () => {
  oldKey = process.env.KERNEL_API_KEY; oldModel = process.env.KERNEL_MODEL
  process.env.KERNEL_API_KEY = 'fixture-key'; process.env.KERNEL_MODEL = 'fixture-model'
})
after(async () => {
  if (oldKey === undefined) delete process.env.KERNEL_API_KEY; else process.env.KERNEL_API_KEY = oldKey
  if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
  await close()
})
async function fixture() {
  const user = await db.user.create({ data: { id: `job-user-${++sequence}`, name: 'Build owner', email: `job-${sequence}@example.test` } })
  const member = await kernel.ensureWorkspace(user)
  const p: Principal = { userId: user.id, name: user.name, workspaceId: member.workspaceId, role: 'owner', kind: 'human' }
  const plan = await kernel.savePlan(p, { content: { request: 'Manage purchasing and supplier approvals.', messages: [], answers: {}, proposal: { plan: { name: app.name, summary: app.description, records: 'Requests and suppliers', workflow: 'Submit and approve requests', rules: 'Owners review', limitations: 'No integrations' }, questions: [] } } })
  const confirmed = await kernel.planState(p, plan.id, plan.version, 'confirmed')
  return { p, plan: confirmed }
}
async function drain(jobs: BuildJobs, p: Principal, id: string) {
  for (let n = 0; n < 25; n++) {
    const job = await jobs.get(p, id)
    if (!['queued', 'running'].includes(job.status)) return job
    await jobs.runOne()
  }
  throw new Error('Worker failed to settle')
}

test('checkpointed tasks resume after a failed assembly, commit atomically once, and enqueue is idempotent', async () => {
  const { p, plan } = await fixture()
  const calls: string[] = []
  let fail = true
  const jobs = new BuildJobs(db, async (input, checkpoints) => {
    const task = nextBuildTask(checkpoints).key; calls.push(task)
    if (task === 'assembly' && fail) { fail = false; throw new KernelError('MODEL_INCOMPLETE', 'Interrupted assembly task', 502, { reason: 'max_output_tokens', outputTokens: 4000 }) }
    return execute(input, checkpoints)
  })
  const queued = await jobs.start(p, plan.id, plan.version)
  assert.equal((await jobs.start(p, plan.id, plan.version)).id, queued.id)
  const failed = await drain(jobs, p, queued.id)
  assert.equal(failed.status, 'failed')
  assert.deepEqual(failed.completedTasks, [])
  assert.equal((failed.error?.details as { reason: string }).reason, 'max_output_tokens')
  assert.equal(await db.projectDraft.count({ where: { workspaceId: p.workspaceId } }), 0)
  const restarted = new BuildJobs(db, (input, checkpoints) => { calls.push(nextBuildTask(checkpoints).key); return execute(input, checkpoints) })
  await restarted.retry(p, queued.id)
  const done = await drain(restarted, p, queued.id)
  assert.equal(done.status, 'completed')
  assert.equal(calls.filter(t => t === 'assembly').length, 2)
  assert.equal(calls.filter(t => t === 'assemble').length, 1)
  assert.deepEqual(done.completedTasks, ['assembly'])
  assert.equal(await db.projectDraft.count({ where: { workspaceId: p.workspaceId } }), 1)
  assert.equal((await kernel.getDraft(p, done.draftId!)).assembly?.modules[0].use, 'purchasing.request')
  assert.equal((await kernel.listPlans(p))[0].status, 'generated')
  assert.equal((await restarted.start(p, plan.id, plan.version)).id, queued.id)
  assert.equal(await db.project.count({ where: { workspaceId: p.workspaceId, slug: { not: 'demo-purchasing' } } }), 0)
  assert.equal(await db.execution.count({ where: { workspaceId: p.workspaceId, action: 'project.draft' } }), 1)
})

test('jobs enforce owner and workspace isolation, including retry', async () => {
  const a = await fixture(), b = await fixture(), jobs = new BuildJobs(db, execute)
  const job = await jobs.start(a.p, a.plan.id, a.plan.version)
  await assert.rejects(jobs.get(b.p, job.id), /not found/)
  await assert.rejects(jobs.retry(b.p, job.id), /not found/)
  await assert.rejects(jobs.start({ ...a.p, kind: 'agent' }, a.plan.id, a.plan.version), /owners/)
  await assert.rejects(jobs.forPlan(b.p, a.plan.id), /not found/)
  await drain(jobs, a.p, job.id)
})

test('a changed plan fences an in-flight checkpoint and cannot reuse its job', async () => {
  const { p, plan } = await fixture()
  let release!: () => void, entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  const jobs = new BuildJobs(db, async () => { entered(); await gate; return assembly })
  const queued = await jobs.start(p, plan.id, plan.version)
  const running = jobs.runOne(); await started
  await kernel.planState(p, plan.id, queued.planVersion, 'planning')
  release(); await running
  assert.equal((await jobs.get(p, queued.id)).status, 'superseded')
  assert.deepEqual((await jobs.get(p, queued.id)).completedTasks, [])
  await assert.rejects(jobs.retry(p, queued.id), /plan changed/)
})

test('expired lease is recovered and a late worker cannot overwrite the new checkpoint', async () => {
  const { p, plan } = await fixture()
  let release!: () => void, entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  const slow = new BuildJobs(db, async () => { entered(); await gate; return { ...assembly, name: 'Late result' } })
  const queued = await slow.start(p, plan.id, plan.version)
  const running = slow.runOne(); await started
  await db.buildJob.update({ where: { id: queued.id }, data: { leaseUntil: new Date(0) } })
  const replacement = new BuildJobs(db, execute)
  await replacement.runOne()
  release(); await running
  const row = await db.buildJob.findUniqueOrThrow({ where: { id: queued.id } })
  assert.equal((row.checkpoints as { assembly: { name: string } }).assembly.name, app.name)
  assert.equal((await drain(replacement, p, queued.id)).status, 'completed')
})

test('revoked owner cannot continue a background build', async () => {
  const { p, plan } = await fixture(), jobs = new BuildJobs(db, execute)
  const job = await jobs.start(p, plan.id, plan.version)
  await db.membership.updateMany({ where: { workspaceId: p.workspaceId, userId: p.userId }, data: { role: 'operator' } })
  await jobs.runOne()
  assert.equal((await db.buildJob.findUniqueOrThrow({ where: { id: job.id } })).status, 'superseded')
})

test('model tasks repair only invalid assembly output and retain incomplete token diagnostics', async () => {
  const tasks: string[] = []
  await executeBuildTask({ brief: 'Purchasing' }, {}, async (_url, init) => {
    const body = JSON.parse(String(init?.body)), input = JSON.parse(body.input)
    tasks.push(input.task)
    assert.equal(body.max_output_tokens, 4000)
    assert.match(body.instructions, /catalog/)
    return completed(tasks.length === 1 ? { ...assembly, links: [] } : assembly)
  })
  assert.deepEqual(tasks, ['assembly', 'assembly'])
  await assert.rejects(modelJson('test', {}, async () => Response.json({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage: { output_tokens: 4000, output_tokens_details: { reasoning_tokens: 3000 } } }), 4000), (error: unknown) => error instanceof KernelError && (error.details as { reasoningTokens: number }).reasoningTokens === 3000)
})

test('SSE cancellation only closes the subscriber; saved work completes and reconnect replays terminal status', async () => {
  const { p, plan } = await fixture(), jobs = new BuildJobs(db, execute)
  const job = await jobs.start(p, plan.id, plan.version)
  const reader = buildJobResponse(() => jobs.get(p, job.id), job).body!.getReader()
  assert.match(new TextDecoder().decode((await reader.read()).value), /Build queued/)
  await reader.cancel()
  const done = await drain(jobs, p, job.id)
  const replay = await buildJobResponse(() => jobs.get(p, job.id), done, job.revision).text()
  assert.match(replay, /"status":"completed"/)
  assert.match(replay, /Nothing has been published/)
})


test('a preview edited during a revision build is never overwritten at assembly', async () => {
  const { p } = await fixture()
  const draft = await kernel.saveDraft(p, { brief: 'Existing purchasing', definition: app, source: 'example' })
  const plan = await kernel.savePlan(p, { draftId: draft.id, content: { request: 'Revise purchasing and preserve all fields.', messages: [], answers: {}, proposal: { plan: { name: app.name, summary: app.description, records: 'Requests and suppliers', workflow: 'Submit and approve', rules: 'Owner review', limitations: 'No integrations' }, questions: [] } } })
  const confirmed = await kernel.planState(p, plan.id, plan.version, 'confirmed')
  const jobs = new BuildJobs(db, execute)
  const queued = await jobs.start(p, confirmed.id, confirmed.version)
  await jobs.runOne()
  assert.equal((await jobs.get(p, queued.id)).task, 'assemble')
  await kernel.saveDraft(p, { id: draft.id, expectedVersion: draft.version, brief: draft.brief, definition: { ...app, name: 'User edited preview' }, source: 'manual' })
  await jobs.runOne()
  assert.equal((await jobs.get(p, queued.id)).status, 'superseded')
  assert.equal((await kernel.getDraft(p, draft.id)).definition.name, 'User edited preview')
})
