import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, exportFilename, exportRecordsCsv } from '../src/lib/record-export'
import { compileAssembly, assemblePattern } from '../src/kernel/application'
import type { RecordData } from '../src/kernel/definition'
const definition = compileAssembly(assemblePattern('crm_sales')).entities[0]
const record = (id: string, capability: string, data: RecordData) => ({ id, capability, data, version: 2, createdAt: '2026-09-28T00:00:00Z', updatedAt: '2026-09-28T01:00:00Z' })

test('CSV preserves quotes, separators, line breaks and unicode while neutralizing text formulas', () => {
  assert.equal(csvCell('北京, "客户"\nNext line'), '"北京, ""客户""\nNext line"')
  for (const value of ['=1+1', '+SUM(A1:A2)', '-1+1', '@command', '\tvalue', '\nformula', '  =1', '\uFEFF@formula']) assert.ok(csvCell(value).startsWith('"\''))
  assert.equal(csvCell(-25), '"-25"')
  assert.equal(csvCell(false), '"false"')
  assert.equal(csvCell(undefined), '""')
})
test('exports only supplied entity records in view order, with raw cents and relationship/member identities', () => {
  const first = record('first', definition.slug, { title: 'First deal', customer: 'a', assignee: 'u', amountCents: 125050, followUpDate: '2026-10-01' })
  const second = record('second', definition.slug, { title: 'Second deal', amountCents: 0 })
  const account = record('a', 'customers', { title: 'Account Alpha' })
  const hidden = record('hidden', definition.slug, { title: 'Hidden deal' })
  const csv = exportRecordsCsv(definition, [second, account, first], [first, second, account, hidden], [{ id: 'u', name: 'Alex' }])
  assert.ok(csv.startsWith('\uFEFF"Record ID"'))
  assert.ok(csv.endsWith('\r\n'))
  assert.ok(csv.indexOf('"second"') < csv.indexOf('"first"'))
  assert.ok(csv.includes('[amountCents; cents]'))
  assert.ok(csv.includes('"125050"'))
  assert.ok(csv.includes('"a","Account Alpha"'))
  assert.ok(csv.includes('"u","Alex"'))
  assert.ok(csv.includes('"2026-10-01"'))
  assert.ok(!csv.includes('Hidden deal'))
  assert.equal(csv.split('\r\n').length, 4)
})
test('missing or incorrectly scoped relationships keep IDs without exposing unrelated names', () => {
  const deal = record('deal', definition.slug, { title: 'Deal', customer: 'bad', assignee: 'gone' })
  const csv = exportRecordsCsv(definition, [deal], [record('bad', 'private_other_entity', { title: 'Do not expose' })])
  assert.ok(csv.includes('"bad","Unavailable record"'))
  assert.ok(csv.includes('"gone","Unavailable member"'))
  assert.ok(!csv.includes('Do not expose'))
  assert.equal(exportRecordsCsv(definition, [], []).split('\r\n').length, 2)
})
test('export filenames cannot contain paths and retain unicode names', () => {
  const now = new Date('2026-09-28T12:00:00Z')
  assert.equal(exportFilename('../客户 / deals.csv', now), '客户-deals-csv-2026-09-28.csv')
  assert.equal(exportFilename('...', now), 'records-2026-09-28.csv')
})
