import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assemblePattern, compileAssembly, purchasingExample, validateApplication } from '../src/kernel/application'
import { applicationPresentation, matchesView, sortViewRecords } from '../src/kernel/application-views'
import { inferNavigationIcon } from '../src/kernel/navigation-icons'
import { applicationContract } from '../src/kernel/application-contract'
import { planMigration } from '../src/kernel/migration'
import { crm } from '../src/kernel/suite'

test('old application definitions receive compatible navigation without adding views', () => {
  const app = purchasingExample()
  const { views, navigation, startView, ...legacy } = app
  const restored = validateApplication(legacy)
  assert.deepEqual(restored.views, [])
  assert.equal(restored.startView, null)
  assert.deepEqual(applicationPresentation(restored).navigation.map(item => item.entity), ['requests', 'suppliers'])
})

test('business navigation icons cover catalog applications without relying on display labels', () => {
  for (const [pattern, expected] of [
    ['purchasing', ['purchase', 'organization']],
    ['crm_sales', ['deal', 'organization', 'contact', 'task', 'activity']],
    ['issues', ['issue', 'project', 'people']],
    ['payments', ['payment', 'organization']],
    ['support', ['ticket', 'organization']],
  ] as const) {
    const app = compileAssembly(assemblePattern(pattern))
    const before = structuredClone(app)
    assert.deepEqual(applicationPresentation(app).navigation.map(item => item.icon), expected, pattern)
    assert.deepEqual(app, before, 'presentation defaults do not mutate published definitions')
  }
  const request = structuredClone(purchasingExample().entities[0])
  request.slug = 'renamed__items'; request.entity.label = '采购事项'
  assert.equal(inferNavigationIcon(request), 'purchase')
  request.entity.name = 'custom_inspection'
  assert.equal(inferNavigationIcon(request), 'records', 'unknown domains receive a neutral fallback')
})

test('custom icon overrides validate, survive presentation, and appear in migration previews', () => {
  const before = purchasingExample()
  const after = structuredClone(before)
  after.navigation[0].icon = 'asset'
  const parsed = validateApplication(after)
  assert.equal(applicationPresentation(parsed).navigation[0].icon, 'asset')
  const { report } = planMigration(before, parsed, 'icons', [], [])
  assert.ok(report.changes.some(change => change.label === 'Navigation' && change.before.includes('icon: purchase') && change.after.includes('icon: asset')))
  assert.equal(report.invalidatedProposals, 0)
  assert.equal(report.canPublish, true)
  assert.throws(() => validateApplication({ ...before, navigation: before.navigation.map(item => ({ ...item, icon: '<svg onload=alert(1)>' })) }))
  const schema = applicationContract().schema as unknown as { properties: { navigation: { items: { properties: { icon: { enum: string[] } }; required: string[] } } } }
  assert.ok(schema.properties.navigation.items.properties.icon.enum.includes('purchase'))
  assert.ok(!schema.properties.navigation.items.required.includes('icon'), 'older definitions remain valid')
})

test('view validation rejects broken references, mismatched values and incomplete navigation', () => {
  for (const change of [
    (app: ReturnType<typeof purchasingExample>) => { app.views[0].entity = 'foreign' },
    (app: ReturnType<typeof purchasingExample>) => { app.views[0].filters[0].field = '__proto__' },
    (app: ReturnType<typeof purchasingExample>) => { app.views[0].filters[0].value = 'unknown_status' },
    (app: ReturnType<typeof purchasingExample>) => { app.views[0].filters[0].operator = 'gte' },
    (app: ReturnType<typeof purchasingExample>) => { app.views[0].sort.field = 'supplier' },
    (app: ReturnType<typeof purchasingExample>) => { app.views[0].columns = ['missing'] },
    (app: ReturnType<typeof purchasingExample>) => { app.views[0].columns = ['status'] },
    (app: ReturnType<typeof purchasingExample>) => { app.views.push(structuredClone(app.views[0])) },
    (app: ReturnType<typeof purchasingExample>) => { app.navigation.reverse(); app.navigation[0].entity = 'requests' },
    (app: ReturnType<typeof purchasingExample>) => { app.startView = 'missing' },
  ]) {
    const app = purchasingExample(); change(app)
    assert.throws(() => validateApplication(app))
  }
})

test('saved views apply typed AND filters and stable numeric sorting without mutating records', () => {
  const view = { ...purchasingExample().views[0], filters: [{ field: 'status', operator: 'eq' as const, value: 'submitted' }, { field: 'amountCents', operator: 'lte' as const, value: 1000 }], sort: { field: 'amountCents', direction: 'asc' as const } }
  const records = [
    { id: 'b', createdAt: '2026-01-01', data: { status: 'submitted', amountCents: 100 } },
    { id: 'a', createdAt: '2026-01-02', data: { status: 'submitted', amountCents: 20 } },
    { id: 'c', createdAt: '2026-01-03', data: { status: 'approved', amountCents: 10 } },
    { id: 'd', createdAt: '2026-01-04', data: { status: 'submitted', amountCents: 1100 } },
  ]
  assert.deepEqual(sortViewRecords(records.filter(record => matchesView(record.data, view)), view.sort).map(record => record.id), ['a', 'b'])
  assert.deepEqual(records.map(record => record.id), ['b', 'a', 'c', 'd'])
  assert.equal(matchesView({ status: 'submitted' }, view), false)
  assert.equal(matchesView({ status: 'submitted', amountCents: '20' }, view), false)
})

test('a second business process uses the same view and navigation contract', () => {
  const app = validateApplication({ name: 'Sales workspace', description: 'Manage qualification of customer leads.', assumptions: [], entities: [crm], navigation: [{ entity: 'crm', label: 'Sales pipeline' }], views: [{ id: 'qualification', name: 'Ready to qualify', entity: 'crm', filters: [{ field: 'status', operator: 'eq', value: crm.entity.fields.status.options![0] }], sort: { field: 'title', direction: 'asc' }, columns: ['title', 'status'] }], startView: 'qualification' })
  assert.equal(applicationPresentation(app).navigation[0].label, 'Sales pipeline')
  assert.equal(matchesView({ status: crm.entity.fields.status.options![0] }, app.views[0]), true)
})
