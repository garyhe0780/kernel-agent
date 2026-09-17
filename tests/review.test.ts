import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PendingApply } from '../src/components/kernel-dialogs'
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
