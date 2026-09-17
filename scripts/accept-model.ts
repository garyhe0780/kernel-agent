import 'dotenv/config'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel } from '../src/kernel/engine.server'
import { buildAssembly, clarifyApplication, modelStatus, planOperation } from '../src/kernel/model.server'
import { compileAssembly } from '../src/kernel/application'
import { validateAssembly } from '../src/kernel/assembly'
import { clarificationSchema, clarifiedBrief } from '../src/kernel/builder-clarification'
import type { Principal, RecordData } from '../src/kernel/definition'
import { openTestDatabase } from '../tests/test-database'

function trace(kind: 'clarification' | 'application'): typeof fetch {
  return async (url, init) => {
    const response = await fetch(url, init)
    if (response.ok && process.argv.includes('--diagnostics')) {
      const body = await response.clone().json() as any
      const text = body.output?.filter((x: any) => x.type === 'message').flatMap((x: any) => x.content ?? []).filter((x: any) => x.type === 'output_text').map((x: any) => x.text ?? '').join('')
      try {
        const trimmed = String(text ?? '').trim()
        const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)
        const value = JSON.parse(fenced ? fenced[1] : trimmed)
        if (kind === 'application') validateAssembly(value); else clarificationSchema.parse(value)
      } catch (error) {
        console.log(`Validation diagnostic (${kind}): ${error instanceof Error ? error.message.slice(0, 1500) : 'invalid'}`)
      }
    }
    return response
  }
}

// Explicit opt-in: this script makes billable calls with synthetic data only.
// DATABASE_URL is intentionally ignored; no real workspace is read or modified.
const report = { mode: 'live', model: modelStatus().model, reasoningEffort: process.env.KERNEL_REASONING_EFFORT?.trim() || 'provider-default', startedAt: new Date().toISOString(), checks: [] as string[], status: 'running', failure: null as string | null }
let db: Awaited<ReturnType<typeof openTestDatabase>>['db'] | undefined, close: (() => Promise<void>) | undefined
const check = (name: string) => { report.checks.push(name); console.log(`PASS ${name}`) }
try {
  assert(modelStatus().configured, 'Configure the provider key and KERNEL_MODEL before running live acceptance.')
  const testDb = await openTestDatabase()
  db = testDb.db
  close = testDb.close
  const kernel = new Kernel(db)
  await db.user.create({ data: { id: 'live-qa', name: 'Synthetic QA', email: 'live-qa@example.test' } })
  const member = await kernel.ensureWorkspace({ id: 'live-qa', name: 'Synthetic QA' })
  const owner: Principal = { userId: 'live-qa', name: 'Synthetic QA', workspaceId: member.workspaceId, role: 'owner', kind: 'human' }
  const agent: Principal = { ...owner, kind: 'agent' }

  const ambiguous = 'Build purchasing for our team; larger purchases need extra checks, but we have not decided the amount or checks.'
  const questions = await clarifyApplication(ambiguous, undefined, trace('clarification'))
  assert(questions.questions.length > 0, 'Ambiguous request should ask a consequential question.')
  assert(questions.questions.length <= 3)
  const answered = clarifiedBrief(ambiguous, questions, Object.fromEntries(questions.questions.map(q => [q.id, 'For this synthetic test, use an approval limit of USD 1000 and require a verified supplier; every proposal needs owner review. No automatic routing.'])))
  assert(answered.includes('Answer:'))
  check('Live clarification yields bounded questions and accepts explicit answers')

  const brief = 'Assemble a purchasing application from Kernel catalog modules purchasing.request and directory.party. Track purchase requests and suppliers. Owners review every purchase. Do not invent entities or extra fields. This is test data only.'
  console.log('RUN clear-request clarification')
  const clear = await clarifyApplication(brief, undefined, trace('clarification'))
  assert.equal(clear.questions.length, 0, 'Fully specified request should bypass clarification.')
  console.log('RUN application generation')
  const assembly = await buildAssembly(brief, undefined, trace('application'))
  assert.ok(assembly.modules.some(item => item.use === 'purchasing.request'))
  assert.ok(assembly.modules.some(item => item.use === 'directory.party'))
  const app = compileAssembly(assembly)
  const requestEntity = app.entities.find(entity => entity.actions.some(action => action.name === 'submit'))
  const partyEntity = app.entities.find(entity => entity.slug !== requestEntity?.slug)
  assert.ok(requestEntity && partyEntity)
  const draft = await kernel.saveDraft(owner, { brief, assembly, source: 'model' })
  assert.deepEqual((await kernel.getDraft(owner, draft.id)).assembly, assembly)
  const published = await kernel.publishDraft(owner, draft.id, draft.version)
  assert.equal((await kernel.snapshot(owner, published.slug)).records.length, 0)
  check('Live generation validates, persists, and publishes without preview records')

  const supplier = await kernel.createRecord(owner, { title: 'QA Supplier', contact: 'qa@example.test' }, `${published.slug}__${partyEntity.slug}`)
  const requestRecord = await kernel.createRecord(owner, { title: 'QA licenses', supplier: supplier.id, amountCents: 50000, category: 'Software', justification: 'Synthetic live purchasing check.' }, `${published.slug}__${requestEntity.slug}`)
  const state = await kernel.snapshot(owner, published.slug)
  const plan = await planOperation({ instruction: 'Submit QA licenses for owner review. Only propose the change.', records: state.records, capabilities: state.capabilities.map(c => c.definition), pending: [] })
  assert.equal(plan.recordId, requestRecord.id)
  assert.equal(plan.action, 'submit')
  const staged = await kernel.stage(agent, { recordId: plan.recordId!, action: plan.action!, input: plan.input, idempotencyKey: 'live-submit-once' })
  assert.equal(staged.status, 'staged')
  const readLead = async () => (await db!.businessRecord.findUniqueOrThrow({ where: { id: requestRecord.id } })).data as RecordData
  assert.equal((await readLead()).status, 'draft')
  await assert.rejects(kernel.review(agent, staged.change!.id, 'apply'))
  await kernel.review(owner, staged.change!.id, 'apply')
  assert.equal((await readLead()).status, 'submitted')
  check('Live operational choice stages correctly and requires owner review')

  const change = await kernel.editProject(owner, published.slug)
  const revisedAssembly = await buildAssembly('Keep the same catalog modules and links. Only rename the application to Team purchasing QA.', change.assembly, trace('application'))
  assert.ok(revisedAssembly.modules.some(item => item.use === 'purchasing.request'))
  assert.ok(revisedAssembly.modules.some(item => item.use === 'directory.party'))
  const revised = compileAssembly(revisedAssembly)
  assert.equal(revised.name, 'Team purchasing QA')
  assert.deepEqual(revised.entities.map(entity => entity.slug), app.entities.map(entity => entity.slug))
  const saved = await kernel.saveDraft(owner, { id: change.id, expectedVersion: change.version, brief: 'Rename the assembled purchasing application', assembly: revisedAssembly, source: 'model' })
  const before = await readLead()
  const preview = await kernel.previewMigration(owner, saved.id, saved.version)
  assert.equal(preview.report.canPublish, true)
  await kernel.publishDraft(owner, saved.id, saved.version, preview.token)
  assert.deepEqual(await readLead(), before)
  check('Live additive revision preserves definitions and stored business values')
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  // Deliberately omit raw model output, endpoint values, credentials and provider bodies.
  report.failure = error instanceof Error && 'code' in error ? String(error.code) : error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'ACCEPTANCE_FAILED'
  console.error(`FAIL ${report.failure}`)
  process.exitCode = 1
} finally {
  if (close) await close()
  const path = join(tmpdir(), 'kernel-model-acceptance.json')
  await writeFile(path, JSON.stringify(report, null, 2), { mode: 0o600 })
  console.log(`Report: ${path}`)
}
