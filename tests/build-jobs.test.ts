import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { Kernel } from '../src/kernel/engine.server'
import { KernelError } from '../src/kernel/errors'
import { BuildJobs } from '../src/kernel/build-jobs.server'
import { nextBuildTask, executeBuildTask, type BuildInput, type Checkpoints } from '../src/kernel/build-pipeline.server'
import { purchasingExample } from '../src/kernel/application'
import type { Principal } from '../src/kernel/definition'
import { modelJson } from '../src/kernel/model.server'
import { buildJobResponse } from '../src/lib/build-job-stream.server'

const folder = mkdtempSync(join(tmpdir(), 'kernel-jobs-'))
const db = new PrismaClient({ datasourceUrl: `file:${join(folder, 'test.db')}` })
const kernel = new Kernel(db)
let sequence = 0
const app = purchasingExample()
const structure = {
  name: app.name, description: app.description, assumptions: app.assumptions,
  entities: app.entities.map(e => ({ slug: e.slug, name: e.name, description: e.description, entityName: e.entity.name, label: e.entity.label, change: 'add', references: Object.entries(e.entity.fields).filter(([, f]) => f.reference).map(([field, f]) => ({ field, target: f.reference, label: f.label, required: f.required })) })),
}
const fixtureOutput = (task: string) => {
  if (task === 'structure') return structure
  const e = app.entities.find(e => e.slug === task.split(':')[1])!
  return task.startsWith('fields:') ? e.entity : { settings: e.settings, reviewerRoles: e.reviewerRoles, actions: e.actions }
}
const completed = (value: unknown) => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] })
const fetcher: typeof fetch = async (_url, init) => completed(fixtureOutput(JSON.parse(JSON.parse(String(init?.body)).input).task))
const execute = (input: BuildInput, checkpoints: Checkpoints) => executeBuildTask(input, checkpoints, fetcher)
let oldKey: string | undefined, oldModel: string | undefined
before(async () => {
  oldKey = process.env.KERNEL_API_KEY; oldModel = process.env.KERNEL_MODEL
  process.env.KERNEL_API_KEY = 'fixture-key'; process.env.KERNEL_MODEL = 'fixture-model'
  const root = new URL('../prisma/migrations/', import.meta.url)
  for (const entry of readdirSync(root).filter(name => /^\d/.test(name)).sort()) for (const sql of readFileSync(new URL(`${entry}/migration.sql`, root), 'utf8').split(';').filter(s => s.trim())) await db.$executeRawUnsafe(sql)
})
after(async () => {
  if (oldKey === undefined) delete process.env.KERNEL_API_KEY; else process.env.KERNEL_API_KEY = oldKey
  if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
  await db.$disconnect(); rmSync(folder, { recursive: true, force: true })
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

test('checkpointed tasks resume after a failed entity, commit atomically once, and enqueue is idempotent', async () => {
  const { p, plan } = await fixture()
  const calls: string[] = []
  let fail = true
  const jobs = new BuildJobs(db, async (input, checkpoints) => {
    const task = nextBuildTask(checkpoints).key; calls.push(task)
    if (task === 'fields:suppliers' && fail) { fail = false; throw new KernelError('MODEL_INCOMPLETE', 'Interrupted supplier task', 502, { reason: 'max_output_tokens', outputTokens: 6000 }) }
    return execute(input, checkpoints)
  })
  const queued = await jobs.start(p, plan.id, plan.version)
  assert.equal((await jobs.start(p, plan.id, plan.version)).id, queued.id)
  const failed = await drain(jobs, p, queued.id)
  assert.equal(failed.status, 'failed')
  assert.deepEqual(failed.completedTasks, ['structure', 'fields:requests'])
  assert.equal((failed.error?.details as { reason: string }).reason, 'max_output_tokens')
  assert.equal(await db.projectDraft.count({ where: { workspaceId: p.workspaceId } }), 0)
  const restarted = new BuildJobs(db, (input, checkpoints) => { calls.push(nextBuildTask(checkpoints).key); return execute(input, checkpoints) })
  await restarted.retry(p, queued.id)
  const done = await drain(restarted, p, queued.id)
  assert.equal(done.status, 'completed')
  assert.equal(calls.filter(t => t === 'structure').length, 1)
  assert.equal(calls.filter(t => t === 'fields:requests').length, 1)
  assert.equal(calls.filter(t => t === 'fields:suppliers').length, 2)
  assert.equal(done.completedTasks.length, 6)
  assert.equal(await db.projectDraft.count({ where: { workspaceId: p.workspaceId } }), 1)
  assert.equal((await kernel.listPlans(p))[0].status, 'generated')
  assert.equal((await restarted.start(p, plan.id, plan.version)).id, queued.id)
  assert.equal(await db.project.count({ where: { workspaceId: p.workspaceId } }), 0)
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
  const jobs = new BuildJobs(db, async () => { entered(); await gate; return structure })
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
  const slow = new BuildJobs(db, async () => { entered(); await gate; return { ...structure, name: 'Late result' } })
  const queued = await slow.start(p, plan.id, plan.version)
  const running = slow.runOne(); await started
  await db.buildJob.update({ where: { id: queued.id }, data: { leaseUntil: new Date(0) } })
  const replacement = new BuildJobs(db, execute)
  await replacement.runOne()
  release(); await running
  const row = await db.buildJob.findUniqueOrThrow({ where: { id: queued.id } })
  assert.equal((row.checkpoints as { structure: { name: string } }).structure.name, app.name)
  assert.equal((await drain(replacement, p, queued.id)).status, 'completed')
})

test('revoked owner cannot continue a background build', async () => {
  const { p, plan } = await fixture(), jobs = new BuildJobs(db, execute)
  const job = await jobs.start(p, plan.id, plan.version)
  await db.membership.updateMany({ where: { workspaceId: p.workspaceId, userId: p.userId }, data: { role: 'operator' } })
  await jobs.runOne()
  assert.equal((await db.buildJob.findUniqueOrThrow({ where: { id: job.id } })).status, 'superseded')
})

test('model tasks repair only invalid entity output and retain incomplete token diagnostics', async () => {
  const checkpoints: Checkpoints = { structure }
  const tasks: string[] = []
  await executeBuildTask({ brief: 'Purchasing' }, checkpoints, async (_url, init) => {
    const body = JSON.parse(String(init?.body)), input = JSON.parse(body.input)
    tasks.push(input.task)
    assert.equal(body.max_output_tokens, 6000)
    const output = structuredClone(app.entities[0].entity)
    if (tasks.length === 1) delete (output.fields as Record<string, unknown>).title
    return completed(output)
  })
  assert.deepEqual(tasks, ['fields:requests', 'fields:requests'])
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
  const jobs = new BuildJobs(db, (input, checkpoints) => executeBuildTask(input, checkpoints, async (_url, init) => {
    const task = JSON.parse(JSON.parse(String(init?.body)).input).task
    return completed(task === 'structure' ? { ...structure, entities: structure.entities.map(e => ({ ...e, change: 'preserve' })) } : fixtureOutput(task))
  }))
  const queued = await jobs.start(p, confirmed.id, confirmed.version)
  await jobs.runOne(); await jobs.runOne()
  assert.equal((await jobs.get(p, queued.id)).task, 'assemble')
  await kernel.saveDraft(p, { id: draft.id, expectedVersion: draft.version, brief: draft.brief, definition: { ...app, name: 'User edited preview' }, source: 'manual' })
  await jobs.runOne()
  assert.equal((await jobs.get(p, queued.id)).status, 'superseded')
  assert.equal((await kernel.getDraft(p, draft.id)).definition.name, 'User edited preview')
})
