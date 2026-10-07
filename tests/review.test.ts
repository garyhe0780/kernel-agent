import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PendingApply, PendingReviewActions } from '../src/components/kernel-dialogs'
import { CapabilitySettings } from '../src/components/project-build'
import { procurement } from '../src/kernel/procurement'
import type { BusinessRecord, Proposal } from '../src/lib/client'

const record: BusinessRecord = { id: 'review-record', capability: 'procurement', entity: 'purchase_request', data: { title: 'Office supplies', status: 'submitted', amountCents: 12000 }, version: 1, createdAt: '2026-09-12T00:00:00Z', updatedAt: '2026-09-12T00:00:00Z' }
const proposal: Proposal = { id: 'review-proposal', capability: 'procurement', recordId: record.id, recordVersion: 1, definitionVersion: 1, action: 'approve', status: 'pending', actorKind: 'agent', proposerName: 'Purchasing assistant', createdAt: record.createdAt, before: record.data, after: { ...record.data, status: 'approved' }, checks: [{ id: 'limit', label: 'Spending limit', passed: true, message: 'Within the approved ceiling' }] }
const render = (current = record) => renderToStaticMarkup(createElement(PendingApply, { record: current, proposal, definition: procurement, busy: false, canReview: true, onReject() {}, onApply() {} }))

test('review includes author, record, before/after values and policy evidence before commit', () => {
  const html = render()
  assert.match(html, /Purchasing assistant/)
  assert.match(html, /Office supplies/)
  assert.match(html, /Before/)
  assert.match(html, /Proposed/)
  assert.match(html, /Submitted/)
  assert.match(html, /Approved/)
  assert.match(html, /Spending limit/)
  assert.match(html, /Within the approved ceiling/)
  assert.match(html, /Apply reviewed change/)
})

test('stale record review disables apply while leaving rejection available', () => {
  const html = render({ ...record, version: 2 })
  assert.match(html, /record changed after the proposal/)
  assert.match(html, /<button[^>]*disabled[^>]*>Apply reviewed change/)
  assert.doesNotMatch(html, /<button[^>]*disabled[^>]*>Reject proposal/)
})

test('persistent review actions retain record and definition version guards', () => {
  const base = { record, proposal, definitionVersion: 1, busy: false, canReview: true, onReject() {}, onApply() {} }
  for (const props of [{ ...base, record: { ...record, version: 2 } }, { ...base, definitionVersion: 2 }]) {
    const html = renderToStaticMarkup(createElement(PendingReviewActions, props))
    assert.match(html, /<button[^>]*disabled[^>]*>Apply reviewed change/)
    assert.doesNotMatch(html, /<button[^>]*disabled[^>]*>Reject proposal/)
  }
  const ready = renderToStaticMarkup(createElement(PendingReviewActions, base))
  assert.doesNotMatch(ready, /<button[^>]*disabled[^>]*>Apply reviewed change/)
})

test('persistent review actions respect reviewer permission and in-flight work', () => {
  const base = { record, proposal, definitionVersion: 1, busy: false, canReview: true, onReject() {}, onApply() {} }
  const readOnly = renderToStaticMarkup(createElement(PendingReviewActions, { ...base, canReview: false }))
  assert.match(readOnly, /An owner must apply this change/)
  assert.doesNotMatch(readOnly, /<button/)
  const busy = renderToStaticMarkup(createElement(PendingReviewActions, { ...base, busy: true }))
  assert.equal((busy.match(/<button[^>]*disabled/g) ?? []).length, 2)
})

test('moving review actions to the footer preserves before/after and policy evidence', () => {
  const html = renderToStaticMarkup(createElement(PendingApply, { record, proposal, definition: procurement, hideActions: true, busy: false, canReview: true, onReject() {}, onApply() {} }))
  for (const evidence of ['Purchasing assistant', 'Before', 'Proposed', 'Spending limit', 'Within the approved ceiling']) assert.ok(html.includes(evidence))
  assert.doesNotMatch(html, /<button/)
})

test('capability settings render published keys without purchasing-specific fields', () => {
  const html = renderToStaticMarkup(createElement(CapabilitySettings, {
    capability: { slug: 'procurement', version: 1, definition: procurement },
    busy: false,
    async onPublish() {},
  }))
  assert.match(html, /Approval Limit \(USD\)/)
  assert.match(html, /Require Verified Supplier/)
  assert.match(html, /Publish version 2/)
  assert.doesNotMatch(html, /approvalLimitCents/)
  const queue = {
    ...procurement,
    slug: 'queue',
    settings: { slaHours: 24, requireAssignee: true },
  }
  const tickets = renderToStaticMarkup(createElement(CapabilitySettings, {
    capability: { slug: 'queue', version: 3, definition: queue },
    busy: false,
    async onPublish() {},
  }))
  assert.match(tickets, /Sla Hours/)
  assert.match(tickets, /Require Assignee/)
  assert.match(tickets, /Publish version 4/)
  assert.doesNotMatch(tickets, /Approval Limit/)
})

test('creation review displays proposed fields without treating a missing record as stale', () => {
  const creation: Proposal = { ...proposal, kind: 'create', action: '$create', recordVersion: 0, before: {}, after: { ...record.data, status: 'draft' }, input: { title: 'Office supplies' } }
  const html = renderToStaticMarkup(createElement(PendingApply, { proposal: creation, definition: procurement, definitionVersion: 1, busy: false, canReview: true, onReject() {}, onApply() {} }))
  assert.match(html, /No record exists yet/)
  assert.match(html, /Office supplies/)
  assert.match(html, /Create reviewed record/)
  assert.doesNotMatch(html, /<button[^>]*disabled[^>]*>Create reviewed record/)
  const stale = renderToStaticMarkup(createElement(PendingApply, { proposal: creation, definition: procurement, definitionVersion: 2, busy: false, canReview: true, onReject() {}, onApply() {} }))
  assert.match(stale, /<button[^>]*disabled[^>]*>Create reviewed record/)
  assert.doesNotMatch(stale, /<button[^>]*disabled[^>]*>Reject proposal/)
})
