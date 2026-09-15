import { test } from 'node:test'
import assert from 'node:assert/strict'
import { purchasingExample, validateApplication } from '../src/kernel/application'
import { recordSections } from '../src/kernel/application-layouts'
import { crm } from '../src/kernel/suite'

test('record layouts validate entity, section and field identity', () => {
  for (const mutate of [
    (app: ReturnType<typeof purchasingExample>) => { app.layouts[0].entity = 'missing' },
    (app: ReturnType<typeof purchasingExample>) => { app.layouts.push(structuredClone(app.layouts[0])) },
    (app: ReturnType<typeof purchasingExample>) => { app.layouts[0].sections[1].id = 'purchase' },
    (app: ReturnType<typeof purchasingExample>) => { app.layouts[0].sections[0].fields.push('missing') },
    (app: ReturnType<typeof purchasingExample>) => { app.layouts[0].sections[1].fields.push('title') },
    (app: ReturnType<typeof purchasingExample>) => { app.layouts[0].sections[0].id = 'constructor' },
  ]) { const app = purchasingExample(); mutate(app); assert.throws(() => validateApplication(app)) }
})

test('layouts preserve field order, keep newly added fields visible, and omit empty sections', () => {
  const app = purchasingExample(), entity = app.entities[0]
  entity.entity.fields.department = { label: 'Department', type: 'string', required: false, editable: true }
  const layout = { entity: 'requests', sections: [{ id: 'decision', name: 'Decision', fields: ['status', 'title'] }, { id: 'empty', name: 'Empty', fields: [] }] }
  const sections = recordSections(entity, layout)
  assert.deepEqual(sections[0].fields, ['status', 'title'])
  assert.equal(sections[1].name, 'Other details')
  assert(sections[1].fields.includes('department'))
  assert.deepEqual(new Set(sections.flatMap(section => section.fields)), new Set(Object.keys(entity.entity.fields)))
  assert.equal(recordSections(entity)[0].name, '')
  const { layouts, ...legacy } = app
  assert.deepEqual(validateApplication(legacy).layouts, [])
})

test('CRM uses the same layout contract for a different business workflow', () => {
  const app = validateApplication({ name: 'Sales workspace', description: 'Qualify customer leads', assumptions: [], entities: [crm], layouts: [{ entity: 'crm', sections: [{ id: 'qualification', name: 'Qualification', fields: ['status', 'title'] }] }] })
  assert.equal(recordSections(app.entities[0], app.layouts[0])[0].name, 'Qualification')
})

test('section conditions use typed record values and keep unassigned fields available', () => {
  const app = purchasingExample(), entity = app.entities[0]
  const layout = { entity: 'requests', sections: [{ id: 'decision', name: 'Decision', fields: ['status', 'decisionNote'], when: { field: 'status', operator: 'neq' as const, value: 'draft' } }] }
  assert.deepEqual(recordSections(entity, layout, { status: 'draft' }).map(section => section.name), ['Other details'])
  assert.deepEqual(recordSections(entity, layout, { status: 'submitted' }).map(section => section.name), ['Decision', 'Other details'])
  assert.deepEqual(recordSections(entity, layout, {}).map(section => section.name), ['Other details'])
  assert.equal(recordSections(entity, layout)[0].name, 'Decision', 'all-sections mode retains conditional fields')
  assert(!recordSections(entity, layout, { status: 'draft' }).flatMap(section => section.fields).includes('decisionNote'))
})

test('section condition validation rejects foreign fields, relationships and invalid types', () => {
  for (const when of [
    { field: 'supplier', operator: 'eq', value: 'foreign-record' },
    { field: '__proto__', operator: 'eq', value: 'x' },
    { field: 'status', operator: 'eq', value: 'missing-status' },
    { field: 'status', operator: 'gte', value: 'draft' },
    { field: 'amountCents', operator: 'lte', value: '100' },
    { field: 'supplierVerified', operator: 'eq', value: 'true' },
    { field: 'amountCents', operator: 'gte', value: -1 },
  ]) {
    const app = purchasingExample()
    assert.throws(() => validateApplication({ ...app, layouts: [{ entity: 'requests', sections: [{ id: 'decision', name: 'Decision', fields: ['status'], when }] }] }))
  }
})

test('section conditions distinguish numeric ranges, booleans, null and default visibility', async () => {
  const { sectionMatches } = await import('../src/kernel/application-layouts')
  assert.equal(sectionMatches({ amountCents: 100 }, { field: 'amountCents', operator: 'lte', value: 100 }), true)
  assert.equal(sectionMatches({ amountCents: 99 }, { field: 'amountCents', operator: 'gte', value: 100 }), false)
  assert.equal(sectionMatches({ amountCents: '100' }, { field: 'amountCents', operator: 'lte', value: 100 }), false)
  assert.equal(sectionMatches({ verified: false }, { field: 'verified', operator: 'eq', value: false }), true)
  assert.equal(sectionMatches({}, { field: 'verified', operator: 'neq', value: true }), false)
  assert.equal(sectionMatches({ verified: 'false' }, { field: 'verified', operator: 'neq', value: true }), false)
  assert.equal(sectionMatches({}, null), true)
})
