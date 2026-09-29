import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { openTestDatabase } from './test-database'
import { Kernel } from '../src/kernel/engine.server'
import { compileAssembly, assemblePattern, validateApplication } from '../src/kernel/application'
import { upgradeCrmRelationships } from '../src/kernel/sales-upgrade'
import { planMigration, type MigratingRecord } from '../src/kernel/migration'
import { moduleById } from '../src/kernel/modules'
import type { Principal, RecordData } from '../src/kernel/definition'

const { db, close } = await openTestDatabase()
after(close)
const kernel = new Kernel(db)
let n = 0
async function fixture() {
  const id = `match-${++n}`
  const user = await db.user.create({ data: { id, name: 'Owner', email: `${id}@example.test` } })
  const membership = await kernel.ensureWorkspace(user)
  const p: Principal = { userId: id, name: user.name, workspaceId: membership.workspaceId, role: 'owner', kind: 'human' }
  const draft = await kernel.saveDraft(p, { brief: 'Relationship consistency acceptance', pattern: 'crm_sales', source: 'manual' })
  const { slug } = await kernel.publishDraft(p, draft.id, draft.version)
  const cap = (entity: string) => `${slug}__${entity}`
  const a = await kernel.createRecord(p, { title: 'Account Alpha' }, cap('customers'))
  const b = await kernel.createRecord(p, { title: 'Account Bravo' }, cap('customers'))
  const contact = await kernel.createRecord(p, { title: 'Example contact', account: a.id }, cap('contacts'))
  return { p, slug, cap, a, b, contact }
}
async function edit(f: Awaited<ReturnType<typeof fixture>>, id: string, values: RecordData) {
  const record = await db.businessRecord.findUniqueOrThrow({ where: { id } })
  const snapshot = await kernel.snapshot(f.p, f.slug)
  const cap = snapshot.capabilities.find(cap => cap.slug === record.capability)!
  const input = Object.fromEntries(Object.keys(cap.definition.actions.find(a => a.name === 'edit')!.input).map(key => [key, (record.data as RecordData)[key] ?? '']))
  return { recordId: id, action: 'edit', input: { ...input, ...values }, expectedVersion: record.version, definitionVersion: cap.version }
}

test('matching rules require compatible relationships and keep old releases immutable', () => {
  assert.equal(moduleById('sales.deal', 2)!.ports.find(p => p.field === 'contactPerson')!.referenceMatch, undefined)
  const app = compileAssembly(assemblePattern('crm_sales'))
  assert.deepEqual(app.entities[0].entity.fields.contactPerson.referenceMatch, { sourceField: 'customer', targetField: 'account' })
  app.entities[0].entity.fields.contactPerson.referenceMatch!.sourceField = 'owner'
  assert.throws(() => validateApplication(app), /same entity/)
})

test('create and direct edits reject mismatches; clearing the contact permits moving accounts', async () => {
  const f = await fixture()
  await assert.rejects(kernel.createRecord(f.p, { title: 'Invalid deal', customer: f.b.id, contactPerson: f.contact.id }, f.cap('opportunities')), /must match/)
  const deal = await kernel.createRecord(f.p, { title: 'Valid deal', customer: f.a.id, contactPerson: f.contact.id }, f.cap('opportunities'))
  await assert.rejects(kernel.act(f.p, await edit(f, deal.id, { customer: f.b.id })), /must match/)
  await assert.rejects(kernel.act(f.p, await edit(f, f.contact.id, { account: f.b.id })), /invalidate a linked/)
  assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: f.contact.id } })).version, 1)
  await kernel.act(f.p, await edit(f, deal.id, { customer: f.b.id, contactPerson: '' }))
  await kernel.act(f.p, await edit(f, f.contact.id, { account: f.b.id }))
})

test('review revalidates a contact changed after staging, and leaves rejected effects unapplied', async () => {
  const f = await fixture()
  const deal = await kernel.createRecord(f.p, { title: 'Pending deal', customer: f.a.id }, f.cap('opportunities'))
  const command = await edit(f, deal.id, { contactPerson: f.contact.id })
  const proposal = await kernel.stage(f.p, { ...command, idempotencyKey: 'matching-proposal' })
  await kernel.act(f.p, await edit(f, f.contact.id, { account: f.b.id }))
  await assert.rejects(kernel.review(f.p, proposal.change!.id, 'apply'), /must match/)
  assert.equal((await db.changeSet.findUniqueOrThrow({ where: { id: proposal.change!.id } })).status, 'pending')
  assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: deal.id } })).version, 1)
})

test('migration reports existing mismatches without overwriting records', () => {
  const current = compileAssembly(assemblePattern('crm_sales'))
  delete current.entities[0].entity.fields.contactPerson.referenceMatch
  delete current.entities[0].actions.find(a => a.name === 'edit')!.input.contactPerson.referenceMatch
  const next = upgradeCrmRelationships(current)
  const records: MigratingRecord[] = [
    { id: 'a', capability: 'test__customers', entity: 'party', version: 1, data: { title: 'Account Alpha', status: 'active' } },
    { id: 'b', capability: 'test__customers', entity: 'party', version: 1, data: { title: 'Account Bravo', status: 'active' } },
    { id: 'c', capability: 'test__contacts', entity: 'contact', version: 1, data: { title: 'Example contact', status: 'active', account: 'b' } },
    { id: 'd', capability: 'test__opportunities', entity: 'opportunity', version: 1, data: { title: 'Existing deal', status: 'new', customer: 'a', contactPerson: 'c' } },
  ]
  const plan = planMigration(current, next, 'test', records, [])
  assert.equal(plan.report.canPublish, false)
  assert.ok(plan.report.blockers.some(b => b.recordId === 'd' && /does not match/.test(b.message)))
  assert.equal(records[3].data.contactPerson, 'c')
})

test('concurrent linking and target reassignment cannot both commit an inconsistent pair', async () => {
  const f = await fixture()
  const changeContact = await edit(f, f.contact.id, { account: f.b.id })
  const results = await Promise.allSettled([
    kernel.createRecord(f.p, { title: 'Racing deal', customer: f.a.id, contactPerson: f.contact.id }, f.cap('opportunities')),
    kernel.act(f.p, changeContact),
  ])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
})
