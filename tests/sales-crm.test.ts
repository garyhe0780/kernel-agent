import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { openTestDatabase } from './test-database'
import { Kernel } from '../src/kernel/engine.server'
import { AgentAccess } from '../src/kernel/agent-access.server'
import { compileAssembly, assemblePattern, validateApplication } from '../src/kernel/application'
import { validateFields, type Principal, type RecordData } from '../src/kernel/definition'
import { actionAvailable } from '../src/lib/project-ui'
import { handleMcp } from '../src/lib/mcp.server'
import { adoptSalesPackage, retireLegacyCrmStages, upgradeCrmMemberOwnership, upgradeLegacyCrm } from '../src/kernel/sales-upgrade'
import { planMigration } from '../src/kernel/migration'
import { moduleById } from '../src/kernel/modules'

const { db, close } = await openTestDatabase()
after(close)
const kernel = new Kernel(db)
const access = new AgentAccess(db)
let sequence = 0
async function fixture(pattern = 'crm_sales') {
  const n = ++sequence
  const user = await db.user.create({ data: { id: `sales-${n}`, name: 'Owner', email: `sales-${n}@example.test` } })
  const member = await kernel.ensureWorkspace(user)
  const human: Principal = { userId: user.id, name: user.name, workspaceId: member.workspaceId, role: 'owner', kind: 'human' }
  const draft = await kernel.saveDraft(human, { brief: 'Daily business workflow acceptance', source: 'manual', pattern })
  const { slug } = await kernel.publishDraft(human, draft.id, draft.version)
  return { human, slug, cap: (entity: string) => `${slug}__${entity}` }
}

test('date validation rejects impossible dates and keeps calendar dates timezone-free', () => {
  const field = { label: 'Due', type: 'string' as const, required: false, editable: true, format: 'date' as const }
  assert.deepEqual(validateFields({ due: field }, { due: '2028-02-29' }), { due: '2028-02-29' })
  assert.deepEqual(validateFields({ due: field }, { due: '' }), { due: '' })
  for (const due of ['2026-02-29', '2026-04-31', 'tomorrow', '2026-01-01T00:00:00Z']) assert.throws(() => validateFields({ due: field }, { due }), /valid date/)
  const app = compileAssembly(assemblePattern('crm_sales'))
  app.entities[0].entity.fields.amountCents.format = 'date'
  assert.throws(() => validateApplication(app), /non-relationship string/)
})

test('sales modules preserve legacy releases and allow migration of an empty CRM', () => {
  const before = compileAssembly(assemblePattern('crm'))
  const after = compileAssembly(assemblePattern('crm_sales'))
  assert.deepEqual(before.entities[0].entity.fields.status.options, ['draft', 'open', 'converted', 'lost'])
  assert.equal(after.entities.length, 5)
  assert.ok(after.entities.every(entity => entity.actions.some(action => action.name === 'edit')))
  assert.equal(planMigration(before, after, 'example', [], []).report.canPublish, true)
  const old = [{ id: 'existing', capability: 'example__opportunities', entity: 'opportunity', version: 1, data: { title: 'Existing deal', source: 'Inbound', status: 'open', customer: 'account' } }]
  assert.equal(planMigration(before, after, 'example', old, []).report.canPublish, false, 'Legacy stages require an explicit compatibility migration, never silent data loss')
})

test('daily CRM workflow records a call, updates a deal and schedules a follow-up with audit evidence', async () => {
  const f = await fixture()
  const account = await kernel.createRecord(f.human, { title: 'Example account' }, f.cap('customers'))
  const contact = await kernel.createRecord(f.human, { title: 'Buyer', account: account.id }, f.cap('contacts'))
  const deal = await kernel.createRecord(f.human, { title: 'Annual subscription', customer: account.id, assignee: f.human.userId, contactPerson: contact.id, amountCents: 250000 }, f.cap('opportunities'))
  const state = await kernel.snapshot(f.human, f.slug)
  const definition = state.capabilities.find(cap => cap.slug === deal.capability)!.definition
  const input = Object.fromEntries(Object.keys(definition.actions.find(action => action.name === 'edit')!.input).map(key => [key, (deal.data as RecordData)[key] ?? '']))
  const record = { ...deal, data: deal.data as RecordData, createdAt: deal.createdAt.toISOString(), updatedAt: deal.updatedAt.toISOString() }
  assert.equal(actionAvailable(definition, record, 'edit', 'owner'), true)
  assert.equal(actionAvailable(definition, record, 'lose_new', 'owner'), true)
  await kernel.createRecord(f.human, { title: 'Discovery call', deal: deal.id, kind: 'Call', occurredOn: '2026-09-28', notes: 'Buyer requested a proposal.' }, f.cap('activities'))
  const edit = { recordId: deal.id, action: 'edit', input: { ...input, nextStep: 'Send proposal', followUpDate: '2026-09-30', closeDate: '2026-10-31' }, expectedVersion: 1, definitionVersion: 1 }
  assert.equal((await kernel.act(f.human, edit)).status, 'applied')
  await assert.rejects(kernel.act(f.human, edit), /changed/)
  await kernel.createRecord(f.human, { title: 'Send proposal', deal: deal.id, assignee: f.human.userId, dueDate: '2026-09-30' }, f.cap('tasks'))
  await kernel.act(f.human, { recordId: deal.id, action: 'advance_new', input: {}, expectedVersion: 2, definitionVersion: 1 })
  const updated = await kernel.snapshot(f.human, f.slug)
  assert.equal((updated.records.find(record => record.id === deal.id)!.data as RecordData).status, 'qualified')
  assert.equal((updated.records.find(record => record.id === deal.id)!.data as RecordData).nextStep, 'Send proposal')
  assert.ok(updated.records.some(record => record.capability === f.cap('tasks') && (record.data as RecordData).deal === deal.id))
  assert.ok(updated.executions.some(event => event.action === `${deal.capability}.edit` && event.outcome === 'applied'))
  await assert.rejects(kernel.act(f.human, { recordId: deal.id, action: 'lose_qualified', input: { category: 'Timing', reason: '', closedOn: '2026-09-30' }, expectedVersion: 3, definitionVersion: 1 }), /characters/)
  await assert.rejects(kernel.act(f.human, { recordId: deal.id, action: 'lose_qualified', input: { reason: 'Budget deferred', closedOn: '2026-09-30' }, expectedVersion: 3, definitionVersion: 1 }), /Loss reason is required/)
  await kernel.act(f.human, { recordId: deal.id, action: 'lose_qualified', input: { category: 'Timing', reason: 'Budget deferred', closedOn: '2026-09-30' }, expectedVersion: 3, definitionVersion: 1 })
})

test('direct actions enforce versions, role, workspace, relationship validity and preserve agent review', async () => {
  const f = await fixture()
  const account = await kernel.createRecord(f.human, { title: 'Example account' }, f.cap('customers'))
  const contact = await kernel.createRecord(f.human, { title: 'Buyer', account: account.id }, f.cap('contacts'))
  const deal = await kernel.createRecord(f.human, { title: 'Example opportunity', customer: account.id, contactPerson: contact.id, nextStep: 'Book discovery' }, f.cap('opportunities'))
  const command = { recordId: deal.id, action: 'advance_new', input: {}, expectedVersion: 1, definitionVersion: 1 }
  await assert.rejects(kernel.act(f.human, { ...command, definitionVersion: 2 }), /changed/)
  const other = await fixture()
  await assert.rejects(kernel.act(other.human, command), /not found/)
  const issued = await access.create(f.human, { project: f.slug, name: 'Sales assistant', expiresInDays: 30, actions: [{ capability: deal.capability, action: 'advance_new', version: 1 }] })
  const agent = await access.authenticate(issued.token)
  await assert.rejects(kernel.act(agent, command), /Agent credentials/)
  await assert.rejects(kernel.executeAgent(agent, { operation: 'action', capability: deal.capability, recordId: deal.id, action: 'advance_new', input: {}, idempotencyKey: 'not-automatic' }), /Human review/)
  const client = new Client({ name: 'sales-test', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost:3000/api/mcp'), { requestInit: { headers: { Authorization: `Bearer ${issued.token}` } }, fetch: async (url, init) => handleMcp(new Request(url, init), access, kernel) }))
  try {
    const tools = (await client.listTools()).tools
    assert.equal(tools.some(tool => tool.name.startsWith('execute_')), false)
    const action = tools.find(tool => tool.name.startsWith('stage_'))!
    const response = await client.callTool({ name: action.name, arguments: { recordId: deal.id, input: {}, idempotencyKey: 'sales-mcp-proposal' } })
    assert.equal(response.isError, false)
    assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: deal.id } })).version, 1)
  } finally { await client.close() }
  const results = await Promise.allSettled([kernel.act(f.human, command), kernel.act(f.human, command)])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(await db.execution.count({ where: { recordId: deal.id, action: `${deal.capability}.advance_new`, outcome: 'applied' } }), 1)
})

test('purchasing decisions still require review and reusable tasks do not depend on sales', async () => {
  const f = await fixture('purchasing')
  const supplier = await kernel.createRecord(f.human, { title: 'Supplier' }, f.cap('suppliers'))
  const request = await kernel.createRecord(f.human, { title: 'Office equipment', supplier: supplier.id, amountCents: 10000, category: 'Equipment', justification: 'Replace broken equipment' }, f.cap('requests'))
  await assert.rejects(kernel.act(f.human, { recordId: request.id, action: 'submit', input: {}, expectedVersion: 1, definitionVersion: 1 }), /reviewed proposal/)
  const app = compileAssembly({ name: 'Team tasks', description: 'Work tracking without a sales dependency.', modules: [{ use: 'work.task', as: 'tasks' }, { use: 'directory.person', as: 'people' }], links: [{ from: 'tasks.owner', to: 'people' }], surfaces: [{ grammar: 'ledger', of: 'tasks', view: 'tasks' }] })
  assert.equal(app.entities.length, 2)
  assert.equal(app.entities[0].entity.fields.deal, undefined)
})


test('compatibility upgrade preserves existing legacy stages until an explicit audited transition', () => {
  const before = compileAssembly(assemblePattern('crm'))
  const after = upgradeLegacyCrm(before)
  const records = [
    { id: 'account', capability: 'example__customers', entity: 'party', version: 1, data: { title: 'Existing account', status: 'active', contact: 'hello@example.test' } as RecordData },
    { id: 'deal', capability: 'example__opportunities', entity: 'opportunity', version: 2, data: { title: 'Existing deal', status: 'open', source: 'Inbound', customer: 'account' } as RecordData },
  ]
  const migration = planMigration(before, after, 'example', records, [])
  assert.equal(migration.report.canPublish, true)
  assert.equal(migration.updates.find(row => row.id === 'deal')!.data.status, 'open')
  assert.ok(after.entities[0].actions.some(action => action.name === 'migrate_open' && action.effects.status === 'qualified'))
})

test('retiring legacy stages is blocked while a deal uses one', () => {
  const before = upgradeLegacyCrm(compileAssembly(assemblePattern('crm')))
  const after = retireLegacyCrmStages(before)
  const deal = after.entities.find(entity => entity.slug === 'opportunities')!
  assert.deepEqual(deal.entity.fields.status.options, ['new', 'qualified', 'discovery', 'proposal', 'negotiation', 'won', 'lost'])
  assert.ok(!deal.actions.some(action => action.name.startsWith('migrate_')))
  assert.ok(!after.views.some(view => view.filters.some(filter => filter.value === 'converted')))
  const account = { id: 'account', capability: 'example__customers', entity: 'party', version: 1, data: { title: 'Existing account', status: 'active', relationship: 'Prospect' } as RecordData }
  const record = (status: string) => ({ id: 'deal', capability: 'example__opportunities', entity: 'opportunity', version: 3, data: { title: 'Existing deal', status, source: 'Inbound', customer: 'account', amountCents: 0 } as RecordData })
  assert.equal(planMigration(before, after, 'example', [account, record('draft')], []).report.canPublish, false)
  assert.equal(planMigration(before, after, 'example', [account, record('new')], []).report.canPublish, true)
  assert.deepEqual(retireLegacyCrmStages(after), after)
})

function releaseThreeSales() {
  const assembly = assemblePattern('crm_sales')
  assembly.modules = [...assembly.modules.map(item => item.use.startsWith('sales.') ? { ...item, version: 3 } : item), { use: 'directory.person', version: 1, as: 'people' }]
  assembly.links = [...assembly.links.filter(link => !/^(tasks|activities)\.(account|contact)$/.test(link.from)), { from: 'opportunities.owner', to: 'people' }, { from: 'tasks.owner', to: 'people' }]
  assembly.surfaces = assembly.surfaces?.filter(surface => surface.view !== 'forecast')
  return compileAssembly(assembly)
}

test('new sales CRMs have member owners, no Team directory, and closed outcomes', () => {
  const app = compileAssembly(assemblePattern('crm_sales'))
  assert.deepEqual(app.entities.map(entity => entity.slug).sort(), ['activities', 'contacts', 'customers', 'opportunities', 'tasks'])
  const deal = app.entities.find(entity => entity.slug === 'opportunities')!
  assert.deepEqual(deal.entity.fields.status.closed, ['won', 'lost'])
  assert.ok(!app.entities.some(entity => Object.values(entity.entity.fields).some(field => field.reference === 'people')))
  assert.ok(moduleById('sales.deal', 3)!.ports.some(port => port.field === 'owner'), 'earlier releases stay immutable')
  assert.throws(() => validateApplication({ ...app, entities: app.entities.map(entity => entity.slug === 'opportunities' ? { ...entity, entity: { ...entity.entity, fields: { ...entity.entity.fields, status: { ...entity.entity.fields.status, closed: ['new'] } } } } : entity) }), /Closed choices/)
})

test('member ownership publication deletes the Team directory and stored owners', async () => {
  const f = await fixture()
  const draft = await kernel.saveDraft(f.human, { brief: 'Release 3 sales CRM', source: 'manual', definition: releaseThreeSales() })
  const { slug } = await kernel.publishDraft(f.human, draft.id, draft.version)
  const cap = (entity: string) => `${slug}__${entity}`
  const person = await kernel.createRecord(f.human, { title: 'Directory rep' }, cap('people'))
  const account = await kernel.createRecord(f.human, { title: 'Customer account' }, cap('customers'))
  const deal = await kernel.createRecord(f.human, { title: 'Owned deal', customer: account.id, owner: person.id }, cap('opportunities'))
  const task = await kernel.createRecord(f.human, { title: 'Owned task', deal: deal.id, owner: person.id }, cap('tasks'))
  const edit = await kernel.editProject(f.human, slug)
  const next = upgradeCrmMemberOwnership(edit.definition)
  assert.deepEqual(upgradeCrmMemberOwnership(next), next)
  const saved = await kernel.saveDraft(f.human, { id: edit.id, expectedVersion: edit.version, brief: 'Members own sales work', source: 'manual', definition: next })
  const preview = await kernel.previewMigration(f.human, saved.id, saved.version)
  assert.equal(preview.report.canPublish, true)
  assert.equal(preview.report.deletedRecordCount, 1)
  assert.equal(preview.report.removedValueCount, 2)
  assert.ok(preview.report.entities.some(entity => entity.slug === 'people' && entity.removed))
  await kernel.publishDraft(f.human, saved.id, saved.version, preview.token)
  const snapshot = await kernel.snapshot(f.human, slug)
  assert.ok(!snapshot.capabilities.some(capability => capability.slug === cap('people')))
  assert.equal(await db.businessRecord.count({ where: { id: person.id } }), 0)
  assert.equal(await db.capability.count({ where: { workspaceId: f.human.workspaceId, slug: cap('people') } }), 0)
  for (const id of [deal.id, task.id]) assert.equal((snapshot.records.find(record => record.id === id)!.data as RecordData).owner, undefined)
  const definition = snapshot.capabilities.find(capability => capability.slug === cap('opportunities'))!.definition
  assert.deepEqual(definition.entity.fields.status.closed, ['won', 'lost'])
  const input = Object.fromEntries(Object.keys(definition.actions.find(action => action.name === 'edit')!.input).map(key => [key, (snapshot.records.find(record => record.id === deal.id)!.data as RecordData)[key] ?? '']))
  assert.equal((await kernel.act(f.human, { recordId: deal.id, action: 'edit', input: { ...input, nextStep: 'Call buyer' }, expectedVersion: 2, definitionVersion: 2 })).status, 'applied')
})

test('stage requirements gate each move, stages set win probability, and outcomes record reasons', async () => {
  const f = await fixture()
  const account = await kernel.createRecord(f.human, { title: 'Forecast account' }, f.cap('customers'))
  const buyer = await kernel.createRecord(f.human, { title: 'Buyer', account: account.id }, f.cap('contacts'))
  const deal = await kernel.createRecord(f.human, { title: 'Platform rollout', customer: account.id }, f.cap('opportunities'))
  assert.equal((deal.data as RecordData).probability, 10)
  const definition = (await kernel.snapshot(f.human, f.slug)).capabilities.find(cap => cap.slug === deal.capability)!.definition
  let version = 1
  const current = async () => (await kernel.snapshot(f.human, f.slug)).records.find(record => record.id === deal.id)!.data as RecordData
  const act = async (action: string, input: Record<string, unknown> = {}) => kernel.act(f.human, { recordId: deal.id, action, input, expectedVersion: version, definitionVersion: 1 }).then(result => { version++; return result })
  const edit = async (changes: RecordData) => { const data = await current(); return act('edit', Object.fromEntries(Object.keys(definition.actions.find(action => action.name === 'edit')!.input).map(key => [key, changes[key] ?? data[key] ?? '']))) }
  await assert.rejects(kernel.act(f.human, { recordId: deal.id, action: 'advance_new', input: {}, expectedVersion: 1, definitionVersion: 1 }), /Primary contact is not set/)
  await edit({ contactPerson: buyer.id, nextStep: 'Book discovery' })
  await act('advance_new')
  assert.equal((await current()).probability, 20)
  await assert.rejects(kernel.act(f.human, { recordId: deal.id, action: 'advance_qualified', input: {}, expectedVersion: version, definitionVersion: 1 }))
  await edit({ assignee: f.human.userId, probability: 35, forecastCategory: 'Best case' })
  assert.equal((await current()).probability, 35, 'reps can adjust the stage probability')
  await act('advance_qualified')
  await assert.rejects(kernel.act(f.human, { recordId: deal.id, action: 'advance_discovery', input: {}, expectedVersion: version, definitionVersion: 1 }))
  await edit({ amountCents: 1200000, closeDate: '2026-12-15' })
  await act('advance_discovery')
  await act('advance_proposal')
  await assert.rejects(act('advance_negotiation', { winReason: 'Luck', closedOn: '2026-12-01' }), /supported choice/)
  await act('advance_negotiation', { winReason: 'Product fit', closedOn: '2026-12-01' })
  const won = await current()
  assert.deepEqual([won.status, won.probability, won.winReason, won.closedOn], ['won', 100, 'Product fit', '2026-12-01'])
  const other = await kernel.createRecord(f.human, { title: 'Lost opportunity', customer: account.id }, f.cap('opportunities'))
  await kernel.act(f.human, { recordId: other.id, action: 'lose_new', input: { category: 'Competitor', reason: 'Chose an incumbent vendor', closedOn: '2026-10-02' }, expectedVersion: 1, definitionVersion: 1 })
  const lost = (await kernel.snapshot(f.human, f.slug)).records.find(record => record.id === other.id)!.data as RecordData
  assert.deepEqual([lost.lossCategory, lost.lossReason, lost.probability, lost.closedOn], ['Competitor', 'Chose an incumbent vendor', 0, '2026-10-02'])
})

test('tasks and activities can link to an account or contact without a deal', async () => {
  const f = await fixture()
  const account = await kernel.createRecord(f.human, { title: 'Renewal account' }, f.cap('customers'))
  const elsewhere = await kernel.createRecord(f.human, { title: 'Other account' }, f.cap('customers'))
  const champion = await kernel.createRecord(f.human, { title: 'Champion', account: account.id }, f.cap('contacts'))
  const outsider = await kernel.createRecord(f.human, { title: 'Outsider', account: elsewhere.id }, f.cap('contacts'))
  const call = await kernel.createRecord(f.human, { title: 'Quarterly check-in', account: account.id, contact: champion.id, kind: 'Call', occurredOn: '2026-09-29' }, f.cap('activities'))
  assert.equal((call.data as RecordData).deal, undefined)
  await kernel.createRecord(f.human, { title: 'Send renewal terms', account: account.id }, f.cap('tasks'))
  await assert.rejects(kernel.createRecord(f.human, { title: 'Mismatched call', account: account.id, contact: outsider.id, kind: 'Call' }, f.cap('activities')), /Contact/)
})

test('rule operators and percent fields validate', () => {
  const app = compileAssembly(assemblePattern('crm_sales'))
  const deal = app.entities.find(entity => entity.slug === 'opportunities')!
  assert.throws(() => validateFields(deal.entity.fields, { title: 'Too likely', status: 'new', customer: 'a', probability: 150 }), /outside the allowed range/)
  const withRule = (rule: Record<string, unknown>) => validateApplication({ ...app, entities: app.entities.map(entity => entity === deal ? { ...deal, actions: deal.actions.map(action => action.name === 'advance_new' ? { ...action, policies: [rule] } : action) } : entity) })
  assert.throws(() => withRule({ id: 'x', label: 'Contact', field: 'contactPerson', operator: 'present', value: false }), /present with value true/)
  assert.throws(() => withRule({ id: 'x', label: 'Value', field: 'title', operator: 'gte', value: 1 }), /numeric/)
  assert.throws(() => validateApplication({ ...app, entities: app.entities.map(entity => entity === deal ? { ...deal, entity: { ...deal.entity, fields: { ...deal.entity.fields, nextStep: { ...deal.entity.fields.nextStep, format: 'percent' } } } } : entity) }), /Percent format requires an integer/)
})

test('adopting the sales package keeps records, the app name and queue time zone', () => {
  const before = upgradeCrmMemberOwnership(releaseThreeSales())
  before.name = 'Gary sales'
  for (const view of before.views) if (view.timeZone) view.timeZone = 'Asia/Shanghai'
  const after = adoptSalesPackage(before)
  assert.equal(after.name, 'Gary sales')
  assert.equal(after.views.find(view => view.id === 'deals_today')!.timeZone, 'Asia/Shanghai')
  const records = [
    { id: 'account', capability: 'example__customers', entity: 'party', version: 1, data: { title: 'Account', status: 'active', relationship: 'Prospect' } as RecordData },
    { id: 'deal', capability: 'example__opportunities', entity: 'opportunity', version: 4, data: { title: 'Existing deal', status: 'new', source: 'Inbound', customer: 'account', amountCents: 0, assignee: '' } as RecordData },
  ]
  const plan = planMigration(before, after, 'example', records, [])
  assert.equal(plan.report.canPublish, true, JSON.stringify(plan.report.blockers))
  assert.equal(plan.report.deletedRecordCount + plan.report.removedValueCount, 0)
  assert.equal(plan.updates.find(update => update.id === 'deal')!.data.probability, 10)
})

test('routine edits refuse status injection and invalid relationships, and operators can edit', async () => {
  const f = await fixture()
  const account = await kernel.createRecord(f.human, { title: 'Customer account' }, f.cap('customers'))
  const deal = await kernel.createRecord(f.human, { title: 'Contract renewal', customer: account.id }, f.cap('opportunities'))
  const snapshot = await kernel.snapshot(f.human, f.slug)
  const definition = snapshot.capabilities.find(cap => cap.slug === deal.capability)!.definition
  const input = Object.fromEntries(Object.keys(definition.actions.find(action => action.name === 'edit')!.input).map(key => [key, (deal.data as RecordData)[key] ?? '']))
  const command = { recordId: deal.id, action: 'edit', input, expectedVersion: 1, definitionVersion: 1 }
  await assert.rejects(kernel.act(f.human, { ...command, input: { ...input, status: 'won' } }), /Unknown field/)
  await assert.rejects(kernel.act(f.human, { ...command, input: { ...input, contactPerson: account.id } }), /existing Primary contact/)
  const operator = await db.user.create({ data: { id: `rep-${sequence}`, name: 'Rep', email: `rep-${sequence}@example.test` } })
  await db.membership.create({ data: { workspaceId: f.human.workspaceId, userId: operator.id, role: 'operator' } })
  const principal: Principal = { ...f.human, userId: operator.id, name: operator.name, role: 'operator' }
  assert.equal((await kernel.act(principal, { ...command, input: { ...input, nextStep: 'Call buyer' } })).status, 'applied')
})

test('legacy CRM publication upgrades existing records transactionally', async () => {
  const f = await fixture('crm')
  const account = await kernel.createRecord(f.human, { title: 'Existing customer' }, f.cap('customers'))
  const deal = await kernel.createRecord(f.human, { title: 'Existing opportunity', source: 'Inbound', customer: account.id }, f.cap('opportunities'))
  const draft = await kernel.editProject(f.human, f.slug)
  const saved = await kernel.saveDraft(f.human, { id: draft.id, expectedVersion: draft.version, brief: 'Upgrade sales with compatibility', source: 'manual', definition: upgradeLegacyCrm(draft.definition) })
  const preview = await kernel.previewMigration(f.human, saved.id, saved.version)
  assert.equal(preview.report.canPublish, true)
  const published = await kernel.publishDraft(f.human, saved.id, saved.version, preview.token)
  assert.equal(published.version, 2)
  const snapshot = await kernel.snapshot(f.human, f.slug)
  assert.equal(snapshot.records.length, 2)
  assert.equal((snapshot.records.find(record => record.id === deal.id)!.data as RecordData).status, 'draft')
  assert.equal(snapshot.capabilities.length, 5)
})
