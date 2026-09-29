import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { openTestDatabase } from './test-database'
import { Kernel } from '../src/kernel/engine.server'
import { AgentAccess } from '../src/kernel/agent-access.server'
import { compileAssembly, assemblePattern, validateApplication } from '../src/kernel/application'
import { calendarDate, matchesView, relativeDate, type SavedView } from '../src/kernel/application-views'
import { upgradeCrmFollowThrough } from '../src/kernel/sales-upgrade'
import { planMigration } from '../src/kernel/migration'
import { moduleById } from '../src/kernel/modules'
import type { Principal, RecordData } from '../src/kernel/definition'

const { db, close } = await openTestDatabase()
after(close)
const kernel = new Kernel(db)
const access = new AgentAccess(db)
let sequence = 0
async function fixture() {
  const n = ++sequence
  const user = await db.user.create({ data: { id: `follow-owner-${n}`, name: 'Owner', email: `follow-owner-${n}@example.test` } })
  const member = await kernel.ensureWorkspace(user)
  const human: Principal = { userId: user.id, name: user.name, workspaceId: member.workspaceId, role: 'owner', kind: 'human' }
  const definition = compileAssembly(assemblePattern('crm_sales'))
  definition.views.forEach(view => { view.timeZone = 'Asia/Shanghai' })
  const draft = await kernel.saveDraft(human, { brief: 'Follow-through acceptance application', definition, source: 'manual' })
  const { slug } = await kernel.publishDraft(human, draft.id, draft.version)
  const account = await kernel.createRecord(human, { title: 'Example account' }, `${slug}__customers`)
  const deal = await kernel.createRecord(human, { title: 'Example deal', customer: account.id, assignee: user.id }, `${slug}__opportunities`)
  const credential = await access.create(human, { project: slug, name: 'Work assistant', expiresInDays: 30, actions: [{ capability: `${slug}__tasks`, action: 'complete', version: 1 }] })
  return { human, slug, deal, agent: await access.authenticate(credential.token), cap: `${slug}__tasks`, definition }
}
const view = (operator: SavedView['filters'][number]['operator'], field: string, value: string | number | boolean): SavedView => ({ id: 'test', name: 'Test', entity: 'tasks', timeZone: 'Asia/Shanghai', columns: ['title'], sort: { field: '$createdAt', direction: 'desc' }, filters: [{ operator, field, value }] })

test('calendar-relative filters respect timezone, leap days and missing dates', () => {
  const now = new Date('2026-09-28T16:01:00Z')
  assert.equal(calendarDate(now, 'Asia/Shanghai'), '2026-09-29')
  assert.equal(calendarDate(now, 'America/New_York'), '2026-09-28')
  assert.equal(relativeDate(-1, 'UTC', new Date('2028-03-01T00:00:00Z')), '2028-02-29')
  assert.equal(relativeDate(-1, 'America/New_York', new Date('2026-03-09T04:30:00Z')), '2026-03-08')
  assert.equal(matchesView({ due: '2026-09-29' }, view('date_on', 'due', 0), { now }), true)
  assert.equal(matchesView({ due: '2026-09-28' }, view('date_before', 'due', 0), { now }), true)
  for (const data of [{}, { due: '' }] as RecordData[]) assert.equal(matchesView(data, view('date_before', 'due', 0), { now }), false)
  assert.equal(matchesView({}, view('date_before', '$updatedAt', -7), { now, updatedAt: '2026-09-21T00:00:00Z' }), true)
  assert.equal(matchesView({}, view('date_before', '$updatedAt', -7), { now, updatedAt: '2026-09-22T00:00:00Z' }), false)
})

test('current-user filters fail closed without identity and terminal deals leave work queues', () => {
  assert.equal(matchesView({ assignee: 'u1' }, view('is_me', 'assignee', true)), false)
  assert.equal(matchesView({ assignee: 'u1' }, view('is_me', 'assignee', true), { userId: 'u1' }), true)
  assert.equal(matchesView({ assignee: 'u2' }, view('is_me', 'assignee', true), { userId: 'u1' }), false)
  const app = compileAssembly(assemblePattern('crm_sales'))
  const queue = app.views.find(view => view.id === 'missing_next_step')!
  for (const status of ['won', 'lost']) assert.equal(matchesView({ status, nextStep: '' }, queue), false)
  assert.equal(matchesView({ status: 'qualified', nextStep: '' }, queue), true)
})

test('invalid filter/field combinations and invalid timezones cannot publish', () => {
  for (const filter of [{ field: 'title', operator: 'is_me', value: true }, { field: 'title', operator: 'date_on', value: 0 }, { field: 'followUpDate', operator: 'date_on', value: 0.5 }, { field: '$updatedAt', operator: 'eq', value: '2026-01-01' }]) {
    const app = compileAssembly(assemblePattern('crm_sales'))
    app.views[0].filters = [filter as SavedView['filters'][number]]
    assert.throws(() => validateApplication(app))
  }
  const app = compileAssembly(assemblePattern('crm_sales'))
  app.views[0].timeZone = 'Mars/Example'
  assert.throws(() => validateApplication(app), /timezone/)
  assert.equal(moduleById('sales.deal', 1)!.definition.entity.fields.assignee, undefined)
  assert.equal(moduleById('sales.deal', 2)!.definition.entity.fields.assignee.format, 'user')
})

test('member assignments validate scope and saved-view queries match UI semantics with bound cursors', async () => {
  const f = await fixture()
  const dueDate = relativeDate(-1, 'Asia/Shanghai')
  const first = await kernel.createRecord(f.human, { title: 'Call first buyer', deal: f.deal.id, assignee: f.human.userId, dueDate }, f.cap)
  await kernel.createRecord(f.human, { title: 'Call second buyer', deal: f.deal.id, assignee: f.human.userId, dueDate }, f.cap)
  await kernel.createRecord(f.human, { title: 'Unassigned task', deal: f.deal.id, dueDate }, f.cap)
  await kernel.createRecord(f.human, { title: 'Undated task', deal: f.deal.id, assignee: f.human.userId }, f.cap)
  await assert.rejects(kernel.createRecord(f.human, { title: 'Foreign assignment', deal: f.deal.id, assignee: 'outside-workspace' }, f.cap), /active workspace member/)
  const restricted = await db.user.create({ data: { id: 'follow-restricted', name: 'Other application user', email: 'follow-restricted@example.test' } })
  await db.membership.create({ data: { userId: restricted.id, workspaceId: f.human.workspaceId, role: 'application' } })
  await assert.rejects(kernel.createRecord(f.human, { title: 'Outside application', deal: f.deal.id, assignee: restricted.id }, f.cap), /outside your application/)
  const snapshot = await kernel.snapshot(f.human, f.slug)
  assert.deepEqual(snapshot.members.map(member => member.id), [f.human.userId])
  const page = await kernel.queryRecords(f.agent, { capability: f.cap, viewId: 'tasks_overdue', limit: 1 })
  assert.equal(page.records.length, 1)
  assert.ok(page.nextCursor)
  await assert.rejects(kernel.queryRecords(f.agent, { capability: f.cap, viewId: 'my_tasks', cursor: page.nextCursor }), /Cursor/)
  const rest = await kernel.queryRecords(f.agent, { capability: f.cap, viewId: 'tasks_overdue', cursor: page.nextCursor })
  assert.equal(rest.records.length, 2)
  const queue = f.definition.views.find(view => view.id === 'tasks_overdue')!
  const expected = snapshot.records.filter(record => record.capability === f.cap && matchesView(record.data as RecordData, queue, { userId: f.human.userId, updatedAt: record.updatedAt })).map(record => record.id).sort()
  assert.deepEqual([...page.records, ...rest.records].map(record => record.id).sort(), expected)
  const mine = await kernel.queryRecords(f.agent, { capability: f.cap, viewId: 'my_tasks' })
  assert.equal(mine.records.length, 3)
  await kernel.act(f.human, { recordId: first.id, action: 'complete', input: {}, expectedVersion: 1, definitionVersion: 1 })
  assert.equal((await kernel.queryRecords(f.agent, { capability: f.cap, viewId: 'tasks_overdue' })).records.length, 2)
  const discovery = await kernel.agentSnapshot(f.agent)
  assert.equal(discovery.currentUserId, f.human.userId)
  assert.ok(discovery.views.some(view => view.id === 'my_tasks'))
})

test('sparse view pages retain a continuation after the bounded scan', async () => {
  const f = await fixture()
  await db.businessRecord.createMany({ data: Array.from({ length: 1001 }, (_, index) => ({ id: `sparse-${String(index).padStart(4, '0')}`, workspaceId: f.human.workspaceId, capability: f.cap, entity: 'task', data: { title: 'Sparse example', status: 'open', dueDate: index === 1000 ? relativeDate(-1, 'Asia/Shanghai') : '', deal: f.deal.id } })) })
  const page = await kernel.queryRecords(f.agent, { capability: f.cap, viewId: 'tasks_overdue' })
  assert.equal(page.records.length, 0)
  assert.ok(page.nextCursor)
  const next = await kernel.queryRecords(f.agent, { capability: f.cap, viewId: 'tasks_overdue', cursor: page.nextCursor })
  assert.equal(next.records.length, 1)
  assert.equal(next.nextCursor, null)
})

test('follow-through upgrade is additive and retains workspace-specific actions and stages', () => {
  const before = compileAssembly(assemblePattern('crm_sales'))
  before.views = before.views.filter(view => !view.filters.some(filter => ['is_me', 'empty', 'date_on', 'date_before'].includes(filter.operator)))
  before.startView = 'pipeline'
  for (const entity of before.entities.filter(entity => ['tasks', 'opportunities'].includes(entity.slug))) {
    delete entity.entity.fields.assignee
    const edit = entity.actions.find(action => action.name === 'edit')!
    delete edit.input.assignee; delete edit.effects.assignee
    for (const action of entity.actions) action.policies = action.policies.filter(rule => rule.field !== 'assignee')
  }
  for (const layout of before.layouts) for (const section of layout.sections) section.fields = section.fields.filter(field => field !== 'assignee')
  for (const view of before.views) view.columns = view.columns.filter(field => field !== 'assignee')
  const after = upgradeCrmFollowThrough(before, 'Asia/Shanghai')
  assert.equal(planMigration(before, after, 'example', [], []).report.canPublish, true)
  assert.equal(after.views.find(view => view.id === 'tasks_today')!.timeZone, 'Asia/Shanghai')
  assert.equal(after.entities[0].actions[0].name, before.entities[0].actions[0].name)
  assert.equal(after.startView, 'deals_today')
})
