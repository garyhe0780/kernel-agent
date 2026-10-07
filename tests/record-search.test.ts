import test from 'node:test'
import assert from 'node:assert/strict'
import { assemblePattern, compileAssembly } from '../src/kernel/application'
import { recordSearchText } from '../src/lib/record-search'

const definition = compileAssembly(assemblePattern('crm_sales')).entities.find(entity => entity.slug === 'opportunities')!

test('record search finds displayed account, contact and member names as well as stored IDs', () => {
  const text = recordSearchText({ title: 'Annual subscription', status: 'new', customer: 'account-1', contactPerson: 'contact-1', assignee: 'member-1', amountCents: 250000 }, definition,
    new Map([['account-1', '北极星 Acme'], ['contact-1', 'Jordan Lee']]), new Map([['member-1', 'Alex Chen']]))
  for (const query of ['annual', '北极星', 'acme', 'jordan lee', 'alex chen', 'member-1', 'account-1', '250000']) assert.ok(text.includes(query), query)
  assert.ok(!text.includes('other member'))
})

test('unavailable references retain IDs and unrelated record names do not leak into search', () => {
  const text = recordSearchText({ title: 'Renewal', customer: 'missing-account', assignee: '', nextStep: 'contact-2' }, definition,
    new Map([['contact-2', 'Unrelated contact']]), new Map([['member-2', 'Unassigned member']]))
  assert.ok(text.includes('missing-account'))
  assert.ok(text.includes('contact-2'))
  assert.ok(!text.includes('unrelated contact'))
  assert.ok(!text.includes('unassigned member'))
})
