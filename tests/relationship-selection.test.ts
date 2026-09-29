import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionFormData, actionReferenceFields, relationshipSelection, validateRelationshipSelections } from '../src/lib/relationship-selection'
import { compileAssembly, assemblePattern } from '../src/kernel/application'
import type { RecordData } from '../src/kernel/definition'

const app = compileAssembly(assemblePattern('crm_sales'))
const definition = app.entities[0]
const fields = definition.entity.fields
const contact = fields.contactPerson
const records = [
  { id: 'first', capability: 'contacts', data: { title: 'First contact', account: 'a' } },
  { id: 'second', capability: 'contacts', data: { title: 'Second contact', account: 'b' } },
  { id: 'outside', capability: 'other_contacts', data: { title: 'Outside', account: 'a' } },
]
test('dependent choices require a source and exclude other accounts and capabilities', () => {
  assert.deepEqual(relationshipSelection(contact, [contact], fields, {}, records, '').options.map(o => o.value), [''])
  assert.match(relationshipSelection(contact, [contact], fields, {}, records, '').description!, /Choose account first/)
  assert.deepEqual(relationshipSelection(contact, [contact], fields, { customer: 'a' }, records, '').options.map(o => o.value), ['', 'first'])
  assert.match(relationshipSelection(contact, [contact], fields, { customer: 'empty' }, records, '').description!, /No matching/)
})
test('changing source retains an incompatible selection visibly and blocks submission until resolved', () => {
  const data: RecordData = { customer: 'b', contactPerson: 'first' }
  const selected = relationshipSelection(contact, [contact], fields, data, records, 'first')
  assert.equal(selected.invalid, true)
  assert.equal(selected.options.find(o => o.value === 'first')?.disabled, true)
  assert.equal(data.contactPerson, 'first')
  assert.throws(() => validateRelationshipSelections(fields, data, records), /does not match/)
  assert.doesNotThrow(() => validateRelationshipSelections(fields, { ...data, contactPerson: '' }, records))
  assert.doesNotThrow(() => validateRelationshipSelections(fields, { ...data, contactPerson: 'second' }, records))
})
test('action field rules come from entity mappings even when input metadata is absent or renamed', () => {
  const action = structuredClone(definition.actions.find(a => a.name === 'edit')!)
  action.input.picked = { ...action.input.contactPerson }
  delete action.input.picked.referenceMatch
  delete action.input.contactPerson
  action.effects.contactPerson = '$input.picked'
  const targets = actionReferenceFields(definition, action, 'picked')
  assert.deepEqual(targets, [contact])
  const data = actionFormData(action, { customer: 'a', contactPerson: 'first' }, { customer: 'b', picked: 'second' })
  assert.equal(data.contactPerson, 'second')
  assert.equal(relationshipSelection(action.input.picked, targets, fields, data, records, 'second').invalid, false)
  assert.equal(actionFormData(action, { customer: 'a' }, { picked: '' }).customer, 'a')
})
test('multiple mapped constraints intersect and unavailable selections are explicit', () => {
  const secondConstraint = { ...contact, referenceMatch: { sourceField: 'alternateAccount', targetField: 'account' } }
  const result = relationshipSelection(contact, [contact, secondConstraint], fields, { customer: 'a', alternateAccount: 'b' }, records, '')
  assert.equal(result.options.length, 1)
  assert.match(relationshipSelection(contact, [contact], fields, { customer: 'a' }, records, 'deleted').options.at(-1)!.label, /Unavailable/)
})
