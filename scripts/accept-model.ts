import 'dotenv/config'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { Kernel } from '../src/kernel/engine.server'
import { buildApplication, clarifyApplication, modelStatus, planOperation } from '../src/kernel/model.server'
import { validateApplication } from '../src/kernel/application'
import { clarificationSchema, clarifiedBrief } from '../src/kernel/builder-clarification'
import type { Principal, RecordData } from '../src/kernel/definition'

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
        if (kind === 'application') validateApplication(value); else clarificationSchema.parse(value)
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
let folder: string | undefined, db: PrismaClient | undefined
const check = (name: string) => { report.checks.push(name); console.log(`PASS ${name}`) }
try {
  assert(modelStatus().configured, 'Configure the provider key and KERNEL_MODEL before running live acceptance.')
  folder = await mkdtemp(join(tmpdir(), 'kernel-live-acceptance-'))
  db = new PrismaClient({ datasourceUrl: `file:${join(folder, 'test.db')}` })
  const root = new URL('../prisma/migrations/', import.meta.url)
  for (const entry of (await readdir(root, { withFileTypes: true })).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const sql = await readFile(new URL(`${entry.name}/migration.sql`, root), 'utf8')
    for (const statement of sql.split(';').filter(s => s.trim())) await db.$executeRawUnsafe(statement)
  }
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

  const brief = 'Create QA Sales, a synthetic CRM with exactly one entity slug crm. Use fields title (lead name), company and contact as required strings; source as required enum Inbound/Referral; status as noneditable enum draft/open/converted/lost default draft. Include open (draft to open), convert (open to converted), lose (open to lost); all actions have no inputs and allow owner/operator, with owner review required. No other fields or rules. Include Open leads and Converted leads saved views, Sales pipeline navigation, and Contact details and Pipeline progress record sections. This is test data only.'
  console.log('RUN clear-request clarification')
  const clear = await clarifyApplication(brief, undefined, trace('clarification'))
  assert.equal(clear.questions.length, 0, 'Fully specified request should bypass clarification.')
  console.log('RUN application generation')
  const app = await buildApplication(brief, undefined, trace('application'))
  assert.equal(app.entities.length, 1)
  const entity = app.entities[0]
  assert.equal(entity.slug, 'crm')
  assert.deepEqual(Object.keys(entity.entity.fields).sort(), ['company', 'contact', 'source', 'status', 'title'])
  assert(app.views.length >= 2 && app.layouts.length > 0)
  const draft = await kernel.saveDraft(agent, { brief, definition: app, source: 'model' })
  assert.deepEqual((await kernel.getDraft(owner, draft.id)).definition, app)
  const published = await kernel.publishDraft(owner, draft.id, draft.version)
  assert.equal((await kernel.snapshot(owner, published.slug)).records.length, 0)
  check('Live generation validates, persists, and publishes without preview records')

  const lead = await kernel.createRecord(owner, { title: 'QA live lead', company: 'QA Synthetic Company', contact: 'QA Contact', source: 'Inbound' }, `${published.slug}__crm`)
  const state = await kernel.snapshot(owner, published.slug)
  const plan = await planOperation({ instruction: 'Open QA live lead in the pipeline. Only propose the change for owner review.', records: state.records, capabilities: state.capabilities.map(c => c.definition), pending: [] })
  assert.equal(plan.recordId, lead.id)
  assert.equal(plan.action, 'open')
  const staged = await kernel.stage(agent, { recordId: plan.recordId!, action: plan.action!, input: plan.input, idempotencyKey: 'live-open-once' })
  assert.equal(staged.status, 'staged')
  const readLead = async () => (await db!.businessRecord.findUniqueOrThrow({ where: { id: lead.id } })).data as RecordData
  assert.equal((await readLead()).status, 'draft')
  await assert.rejects(kernel.review(agent, staged.change!.id, 'apply'))
  await kernel.review(owner, staged.change!.id, 'apply')
  assert.equal((await readLead()).status, 'open')
  check('Live operational choice stages correctly and requires owner review')

  const change = await kernel.editProject(owner, published.slug)
  const revised = await buildApplication('Add only an optional editable string field internalNote labeled Internal note to crm, with no default. Preserve every existing entity, field, action, policy, setting, navigation item, saved view and layout unchanged.', change.definition)
  assert.equal(revised.entities[0].entity.fields.internalNote?.type, 'string')
  assert.equal(revised.entities[0].entity.fields.internalNote.required, false)
  const withoutNote = structuredClone(revised.entities[0]); delete withoutNote.entity.fields.internalNote
  assert.deepEqual(withoutNote, entity, 'Additive request must preserve the existing entity contract.')
  assert.deepEqual(revised.views, app.views)
  assert.deepEqual(revised.layouts, app.layouts)
  assert.deepEqual(revised.navigation, app.navigation)
  assert.equal(revised.startView, app.startView)
  const saved = await kernel.saveDraft(agent, { id: change.id, expectedVersion: change.version, brief: 'Add optional Internal note', definition: revised, source: 'model' })
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
  if (db) await db.$disconnect()
  if (folder) await rm(folder, { recursive: true, force: true })
  const path = join(tmpdir(), 'kernel-model-acceptance.json')
  await writeFile(path, JSON.stringify(report, null, 2), { mode: 0o600 })
  console.log(`Report: ${path}`)
}
